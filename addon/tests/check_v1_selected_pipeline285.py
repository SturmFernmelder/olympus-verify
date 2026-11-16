"""Actual selected-route envelope -> Watcher validator -> current Lua Guild controls.
Opt-in genuine-Workerd artifact consumer; synthetic native UI, no game/provider input.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'watcher'))
import launch_operations229 as launch
import lupa
import lupa.luajit21 as runtime


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    sources = ['addon/tests/check_v1_selected_pipeline285.py', 'addon/tests/wow_mock.lua',
               'addon/OlympusVerify/Libs/OlympusHmac.lua', 'addon/OlympusVerify/OlympusVerify.lua',
               'addon/OlympusVerify/OlympusVerifyNativeRankConstants.lua', 'addon/OlympusVerify/OlympusVerifyNativeRanks.lua',
               'addon/OlympusVerify/OlympusVerifyLaunch229.lua', 'addon/OlympusVerify/OlympusVerifyRosterModel.lua',
               'addon/OlympusVerify/OlympusVerifyGuild.lua', 'watcher/launch_operations229.py',
               'watcher/native_rank_schemes.py']
    def source_hashes():
        return {name: hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in sources}
    before = source_hashes()
    raw = args.case.read_bytes()
    case = json.loads(raw)
    selected = case['selection']
    assert selected['activePolicyVersion'] == 1, 'actual fixture must retain serving v1 policy'
    reply = selected['initial']
    page = reply['page']
    assert page['promotions'], 'actual serving-v1 selected route must issue its one-step plan'
    plan = page['promotions'][0]
    assert (plan['currentSlot'], plan['targetSlot'], plan['reason']) == (9, 8, 'verified-initiate')
    target, actor = plan['guid'], reply['actorGuid']
    at = int(reply['controlId'].split(':')[0])
    names = page['rankNames']
    # Same clearly synthetic 907-row native fixture as the actual Workerd producer;
    # its source evidence is a test artifact, never an installed client roster.
    members = [dict(name='Synthetic '+str(i), guid='Player-4613-'+format(0x10000000+i, 'X'),
                    rank=names[i % 10], rankIndex=i % 10, level=60, online=False)
               for i in range(page['memberCount']-1)]
    members.append(dict(name=plan['name'], guid=target, rank='Initiate', rankIndex=9, level=60, online=False))
    assert members[0]['guid'] == actor and len(members) == 907
    roster = dict(exportedAt=page['snapshotAt'], total=len(members), online=0,
                  nativeGuild=page['guild'], nativeRealm=page['realm'],
                  nativeRankTable=dict(version=1, names=names), members=members)
    secret = 'synthetic-only-directive-pipeline-secret'
    control = dict(version=4, action='select-directive', id=reply['controlId'], observedAt=at,
                   scopeHash=page['scopeHash'], guid=actor, targetGuids=[target], confirmations='[]')
    control['mac'] = launch.selected_control_mac(secret, control)
    accepted = dict(snapshot=page['snapshotId'], exportedAt=page['snapshotAt'],
                    digest=launch.complete_roster_digest(roster))
    clock = max(at, page['fetchedAt'])
    reader = launch.SelectedRead(lambda: clock)
    reader.request(control, accepted, roster, clock)
    calls = []
    def transport(method, url, retries):
        calls.append((method, retries))
        return True, copy.deepcopy(reply)
    reader.step(transport, clock)
    assert calls == [('GET', 1)] and reader.record['completed'] and reader.record['attempts'] == 1
    rendered = launch.render_selected(reader.record, clock)
    assert rendered is not None and 'pageCursor' not in rendered and 'nextCursor' not in rendered
    assert reader.record['observedAt'] == at and reader.record['snapshotAt'] == page['snapshotAt']
    # Source-held transport variants use the genuine Worker envelope and the
    # actual Watcher closed-reason validator/serializer. The reason choices are
    # synthetic faults; they are not claims that the real Worker emitted each.
    refresh_codes = ('native-rank-scheme-unconfirmed', 'selection-source-not-current',
                     'native-snapshot-unavailable', 'promotion-actor-unconfirmed',
                     'entitlement-expired', 'native-snapshot-changed',
                     'launch-page-verification-changed', 'selection-read-expired',
                     'launch-read-window-exhausted')
    permanent_codes = ('directive-rank-policy-held', 'flagship-native-scope-unconfirmed',
                       'native-secret-unconfigured', 'native-identity-ambiguous')
    held_cases = []
    for code in refresh_codes + permanent_codes + ('PRIVATE_CANARY',):
        stopped = launch.SelectedRead(lambda: clock)
        stopped.request(control, accepted, roster, clock)
        failure = copy.deepcopy(reply)
        failure['coveredGuids'] = []
        failure['page']['expiresAt'] = min(failure['page']['expiresAt'], failure['page']['fetchedAt']+60)
        failure['page'].update(status='held', promotions=[], invites=[], riskBuffer=[], held=[], heldReasons=[code])
        stopped.step(lambda *_args, **_kwargs: (True, failure), clock)
        expected_code = 'source-held' if code == 'PRIVATE_CANARY' else code
        assert stopped.record['stoppedReason'] == expected_code and not stopped.running, (code, stopped.record['stoppedReason'])
        encoded = launch.render_selected(stopped.record, clock)
        assert encoded is not None
        held_cases.append(dict(code=expected_code, refreshable=code in refresh_codes, rendered=encoded))
    for code in ('source-unknown', 'source-refused', 'rate-limited-wait', 'pending'):
        stopped = launch.SelectedRead(lambda: clock)
        stopped.request(control, accepted, roster, clock)
        if code == 'source-unknown':
            def unknown(*_args, **_kwargs):
                raise OSError('synthetic unknown selected read')
            stopped.step(unknown, clock)
        elif code == 'source-refused':
            stopped.step(lambda *_args, **_kwargs: (False, dict(httpStatus=403)), clock)
        elif code == 'rate-limited-wait':
            stopped.step(lambda *_args, **_kwargs: (False, dict(httpStatus=429, retryAfterSeconds=5)), clock)
        encoded = launch.render_selected(stopped.record, clock)
        assert encoded is not None
        held_cases.append(dict(code=code, refreshable=False, rendered=encoded))
    lua = runtime.LuaRuntime(unpack_returned_tuples=True)
    lua.globals().PIPELINE_HOLDS = lua.eval(launch._lua(held_cases))
    lua.globals().PIPELINE_NATIVE = lua.eval(launch._lua(roster))
    lua.globals().PIPELINE_CONTROL = lua.eval(launch._lua(control))
    discovery = copy.deepcopy(selected['discovery'])
    discovery.pop('pageCursor', None)
    discovery.pop('nextCursor', None)
    lua.globals().PIPELINE_DISCOVERY = lua.eval(launch._lua(discovery))
    lua.globals().PIPELINE_RESULT = rendered
    lua.globals().PIPELINE_SECRET = secret
    lua.globals().PIPELINE_AT = at
    lua.globals().PIPELINE_LOADED_AT = clock
    previous = os.getcwd()
    try:
        os.chdir(ROOT / 'addon' / 'tests')
        result = lua.execute(r'''
local e=setmetatable({}, {__index=_G});e._G=e
setfenv(assert(loadfile('wow_mock.lua')),e)()
local roster,control=PIPELINE_NATIVE,PIPELINE_CONTROL
local target=control.targetGuids[1];local effects,syncs=0,0
local function same(a,b)if type(a)~=type(b)then return false end;if type(a)~='table'then return a==b end;for k,v in pairs(a)do if not same(v,b[k])then return false end end;for k in pairs(b)do if a[k]==nil then return false end end;return true end
local function copy(a)if type(a)~='table'then return a end;local b={};for k,v in pairs(a)do b[k]=copy(v)end;return b end
local function load(name)setfenv(assert(loadfile('../OlympusVerify/'..name)),e)('OlympusVerify')end
local function emit(event)e.OlympusLaunch229.Events:GetScript('OnEvent')(e.OlympusLaunch229.Events,event)end
local function denied()effects=effects+1;error('no native rank action is permitted by this read test')end
e.NOW=PIPELINE_AT-1;e.ROSTER=roster.members
-- Mock GetGuildRosterInfo resolves .rankIndex and .guid from these public synthetic rows.
e.GetGuildInfo=function()return roster.nativeGuild,'Guild Master',0 end
e.GetRealmName=function()return roster.nativeRealm end;e.UnitGUID=function()return control.guid end
e.GetGuildRosterShowOffline=function()return true end;e.InCombatLockdown=function()return false end
e.CanGuildPromote=function()return true end;e.issecretvalue=function()return false end
e.GuildControlGetNumRanks=function()return 10 end;e.GuildControlGetRankName=function(i)return roster.nativeRankTable.names[i]end
e.C_GuildInfo.IsGuildRankAssignmentAllowed=function()return true end
e.C_GuildInfo.Promote=denied;e.GuildPromote=denied;e.SECURE_MACRO_EXECUTE=denied
e.OlympusVerifyConfig={membershipOnly=true,secret=PIPELINE_SECRET}
e.OlympusVerifyDB={}
load('Libs/OlympusHmac.lua');load('OlympusVerifyNativeRankConstants.lua');load('OlympusVerifyNativeRanks.lua')
load('OlympusVerify.lua');e.OlympusVerifyFrame:GetScript('OnEvent')(e.OlympusVerifyFrame,'ADDON_LOADED','OlympusVerify')
e.OlympusVerifyAPI.Sync=function()syncs=syncs+1 end
load('OlympusVerifyLaunch229.lua');emit('GUILD_ROSTER_UPDATE')
assert(e.OlympusLaunch229.Control('scan'))
local oldControl=e.OlympusVerifyDB.launchControl;local oldControlImage=copy(oldControl)
e.OlympusLaunchQueue={version=3,controlId=oldControl.id,scanComplete=false,discoveredPages=1,refreshedPages=0,running=false,pages={PIPELINE_DISCOVERY}}
local sourceImage=copy(e.OlympusLaunchQueue)
e.NOW=PIPELINE_AT
load('OlympusVerifyRosterModel.lua')
e.OlympusVerifyLists={version=2,guild=roster.nativeGuild,realm=roster.nativeRealm,
 verified={fetchedAt=e.NOW,snapshotAt=roster.exportedAt,members={{name=roster.members[#roster.members].name,guid=target,status='member',username='synthetic',displayName='Synthetic'}}},
 unverified={fetchedAt=e.NOW,snapshotAt=roster.exportedAt,members={}},unknown={fetchedAt=e.NOW,snapshotAt=roster.exportedAt,members={}}}
e.UIParent:Show();e.UIParent.GetRight=function()return 1920 end
local host=e.CreateFrame('Frame',nil,e.UIParent);host:Show();host:SetSize(900,700);host.GetRight=function()return 1100 end;host.GetAlpha=function()return 1 end;host.GuildMemberDetailFrame=false
local list=e.CreateFrame('Frame',nil,host);list:Show();list.expandedDisplay=true;list.GetSelectedClubId=function()return 77 end
e.C_Club={GetGuildClubId=function()return 77 end};host.MemberList=list;e.CommunitiesFrame=host
local row=e.CreateFrame('Button',nil,list);row:Show();row:SetSize(600,20);row.member={name=roster.members[#roster.members].name..'-Forever',guid=target};row.GetMemberInfo=function(self)return self.member end
list.ScrollBox={ForEachFrame=function(_,fn)fn(row)end}
load('OlympusVerifyGuild.lua');local frame=e.FRAMES[#e.FRAMES]
local function tick()frame:GetScript('OnUpdate')(frame,0.3)end
local function owner()for _,f in ipairs(e.FRAMES)do if f.nativeRow==row then return f end end end
local function button()local f=owner();return f and f.promote end
frame:GetScript('OnEvent')(frame,'PLAYER_LOGIN');frame:GetScript('OnEvent')(frame,'ADDON_LOADED','Blizzard_Communities');tick()
assert(button():GetText()=='Check'and button():IsEnabled(),'serving-v1 advisory discovery must expose separate native Check: '..tostring(button():GetText())..'; '..tostring(button().detail and button().detail.state)..'; '..tostring(button().detail and button().detail.reason)..'; verification='..tostring(owner().result and owner().result.status)..'; '..tostring(owner().result and owner().result.reason))
button():Click()
assert(same(e.OlympusVerifyDB.launchControl,control),'actual Guild Check must generate the same closed signed control consumed by the real selected route')
assert(effects==0 and syncs==2,'discovery and selected controls are reads only')
e.NOW=PIPELINE_LOADED_AT
setfenv(assert(loadstring(PIPELINE_RESULT)),e)()
emit('GUILD_ROSTER_UPDATE');frame:GetScript('OnEvent')(frame,'GUILD_ROSTER_UPDATE');tick()
local view=e.OlympusLaunch229.Current()
assert(view and view.selection and view.selection.completed and view.freshness[target].kind=='selected')
assert(button():GetText()=='Promote'and button():IsEnabled(),'actual Watcher output must enable the separate native Promote button')
assert(same(oldControl,oldControlImage)and same(e.OlympusLaunchQueue,sourceImage),'new selected observation cannot rewrite discovery or its original control')
assert(next(e.OlympusVerifyDB.launchPromotionAttempts or{})==nil and effects==0,'read path cannot spend or fabricate native attempt history')
-- Denial-only fixture: an unresolved current native command still wins over the ready plan.
local unknown={original='synthetic unresolved native command'};e.OlympusLaunch229.pending[target]=unknown;tick()
assert(button():GetText()=='Held'and not button():IsEnabled()and e.OlympusLaunch229.pending[target]==unknown and effects==0)
e.OlympusLaunch229.pending[target]=nil
for _,case in ipairs(PIPELINE_HOLDS)do
 e.OlympusVerifyDB.launchControl=copy(control)
 setfenv(assert(loadstring(case.rendered)),e)()
 emit('GUILD_ROSTER_UPDATE');frame:GetScript('OnEvent')(frame,'GUILD_ROSTER_UPDATE');tick()
 local selectedImage=copy(e.OlympusLaunchSelected)
 local previousControl=e.OlympusVerifyDB.launchControl;local controlImage=copy(previousControl)
 local history=copy(e.OlympusVerifyDB.launchPromotionAttempts);local beforeSync=syncs
 local view=e.OlympusLaunch229.Current()
 assert(view and view.selection and view.selection.code==case.code,case.code..' must survive the Watcher to addon boundary')
 assert((view.selection.refreshable==true)==case.refreshable,case.code..' closed refreshability mismatch')
 assert(not view.selection.reason:find('PRIVATE_CANARY',1,true),'unknown raw source text must stay private')
 if case.refreshable then
  assert(button():GetText()=='Check'and button():IsEnabled(),case.code..' must offer actual enabled Guild Check')
  -- The same read hold cannot bypass an unresolved native command.
  e.OlympusLaunch229.pending[target]=unknown;tick();button():Click()
  assert(not button():IsEnabled()and syncs==beforeSync and e.OlympusVerifyDB.launchControl==previousControl and e.OlympusLaunch229.pending[target]==unknown,case.code..' cannot clear or repeat unresolved native custody')
  e.OlympusLaunch229.pending[target]=nil;tick();button():Click()
  local nextControl=e.OlympusVerifyDB.launchControl
  assert(syncs==beforeSync+1 and nextControl~=previousControl and nextControl.id~=previousControl.id and nextControl.version==4 and nextControl.action=='select-directive'and #nextControl.targetGuids==1 and nextControl.targetGuids[1]==target and nextControl.confirmations=='[]',case.code..' must create exactly one separate signed read')
  local message=table.concat({'launch-selected-read','4','select-directive',nextControl.id,tostring(nextControl.observedAt),nextControl.scopeHash,nextControl.guid,target,nextControl.confirmations},'|')
  assert(nextControl.mac==e.OlympusHmac.hmacSha256hex(PIPELINE_SECRET,message):sub(1,32),case.code..' must use the original Check factory MAC')
 else
  assert(not button():IsEnabled(),case.code..' must remain disabled')
  button():Click()
  assert(syncs==beforeSync and e.OlympusVerifyDB.launchControl==previousControl,case.code..' cannot replace a permanent or still-running read')
 end
 assert(same(previousControl,controlImage)and same(e.OlympusLaunchSelected,selectedImage)and same(e.OlympusVerifyDB.launchPromotionAttempts,history)and effects==0,case.code..' cannot renew old evidence, edit history or send a native action')
end
return true
''')
    finally:
        os.chdir(previous)
    assert result is True
    after = source_hashes()
    assert before == after and args.case.read_bytes() == raw, "pipeline inputs changed during acceptance"
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / 'RESULT.json').write_text(json.dumps(dict(
        schema='native-v1-selected-pipeline285', ok=True,
        sourceCaseSHA256=hashlib.sha256(raw).hexdigest(),
        watcherOutputSHA256=hashlib.sha256(rendered.encode()).hexdigest(),
        sourceInputsBefore=before, sourceInputsAfter=after, stable=True,
        sourceObservedAt=at, sourceLoadedAt=clock,
        activePolicyVersion=selected['activePolicyVersion'], target=(9, 8),
        watcherGETAttempts=len(calls), stoppedReadCases=len(held_cases), refreshableReadCases=len(refresh_codes),
        preservedUnresolvedNativeCases=len(refresh_codes), nativeActions=0, providerActions=0,
        lupa=lupa.__version__, luaJIT=runtime.LUA_VERSION,
        scope='Actual local Workerd artifact, actual Watcher validation/rendering, actual Lua Guild controls; synthetic native APIs only. No installed-client acceptance.'
    ), indent=2)+'\n', encoding='utf-8')
    print('v1 selected pipeline: actual Worker -> Watcher -> Guild Promote ready; 18 stopped/pending cases, 9 separate Check actions and 9 unresolved-native holds; native actions=0')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())

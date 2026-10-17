from pathlib import Path
import argparse,datetime,hashlib,json,sys,time,urllib.request
import lupa
import lupa.lua51 as runtime
from lupa.lua51 import LuaRuntime

ROOT=Path(__file__).resolve().parents[2]
FIXTURES=ROOT/'addon/tests/fixtures/community-census'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def fetch_pinned(entry,destination):
    # Only immutable URLs from the reviewed fixture map; no cache/latest fallback.
    expected_url=('https://raw.githubusercontent.com/dnl-gentile/olympus-addon/'
                  'f60f18814f2426a5c21f97e207611871a06366b4/Olympus/'+entry['path'])
    if entry['path'] not in ('Data.lua','Bridge.lua') or entry['url']!=expected_url:
        raise ValueError('unexpected upstream URL')
    deadline=time.monotonic()+30
    with urllib.request.urlopen(expected_url,timeout=15) as response:
        if response.geturl()!=expected_url:
            raise ValueError('upstream redirect refused')
        length=response.headers.get('Content-Length')
        if length is not None and int(length)!=entry['bytes']:
            raise ValueError('upstream byte count mismatch')
        chunks=[];remaining=entry['bytes']+1
        while remaining:
            if time.monotonic()>deadline:
                raise TimeoutError('upstream total deadline')
            chunk=response.read(min(8192,remaining))
            if not chunk:break
            chunks.append(chunk);remaining-=len(chunk)
        data=b''.join(chunks)
    if len(data)!=entry['bytes'] or hashlib.sha256(data).hexdigest()!=entry['sha256']:
        raise ValueError('upstream bytes or SHA256 mismatch')
    with destination.open('xb') as stream:stream.write(data)

parser=argparse.ArgumentParser(description='Pinned real Bridge/Data consumer suite, Lua 5.1; no live data.')
choice=parser.add_mutually_exclusive_group(required=True)
choice.add_argument('--upstream-dir',type=Path)
choice.add_argument('--fetch-upstream',action='store_true')
parser.add_argument('--run-dir',required=True,type=Path)
args=parser.parse_args()
run=args.run_dir.resolve();run.mkdir(parents=True,exist_ok=False)
assert lupa.__version__=='2.8',lupa.__version__
assert runtime.LUA_VERSION==(5,1),runtime.LUA_VERSION
spec=json.loads((FIXTURES/'pins.json').read_text(encoding='utf-8'))
pins=[{'path':str(ROOT/rel),**entry} for rel,entry in spec['fixtures'].items()]
assert all(Path(p['path']).stat().st_size==p['bytes'] and sha(Path(p['path']))==p['sha256'] for p in pins)
upstream=args.upstream_dir.resolve() if args.upstream_dir else run/'upstream'
if args.fetch_upstream:
    upstream.mkdir()
    for entry in spec['upstream']['files']:fetch_pinned(entry,upstream/entry['path'])
for entry in spec['upstream']['files']:
    path=upstream/entry['path']
    assert path.stat().st_size==entry['bytes'] and sha(path)==entry['sha256'],entry['path']
    pins.append({**entry,'path':str(path)})
# The original pin-preservation predicate now maps actual current checkout inputs.
assert all(sha(Path(p['path']))==p['sha256'] for p in pins)
combined=(upstream/'Bridge.lua').read_bytes()+b'\n'+(FIXTURES/'bridge-extension.lua').read_bytes()
assert hashlib.sha256(combined).hexdigest()==spec['combinedBridgeSHA256']
source=ROOT/'addon/OlympusVerify/OlympusVerifyCensus.lua'
own=[ROOT/rel for rel in spec['checkoutInputPaths']]
assert all(path.is_file() for path in own)
before={str(p):sha(p) for p in own}
tool_paths=[Path(sys.executable).resolve(),Path(runtime.__file__).resolve()]
tool_before={str(p):sha(p) for p in tool_paths}
lua=LuaRuntime(unpack_returned_tuples=True)
lua.execute((FIXTURES/'fixture.lua').read_text(encoding='utf-8'))
lua.execute((upstream/'Data.lua').read_text(encoding='utf-8'),'Olympus',lua.globals().ns)
lua.execute('actualSummary=ns.Data.Summary')
lua.execute((upstream/'Bridge.lua').read_text(encoding='utf-8'),'Olympus',lua.globals().ns)
lua.execute(source.read_text(encoding='utf-8'))
checks=[]
def check(name,code):
    error=None
    try:passed=bool(lua.eval('(function() '+code+' end)()'))
    except Exception as e:passed=False;error=str(e)
    checks.append({'name':name,'pass':passed,**({'error':error} if error else {})})
    print(('PASS ' if passed else 'FAIL ')+name,flush=True)
check('Original 1.2.3 API 1 remains unavailable',"local ok,e=OlympusVerifyCensus.SetEnabled(true);local s,w=OlympusVerifyCensus.Preview();return OlympusBridge.API_VERSION==1 and not ok and e=='optional_upstream_method_unavailable' and s==nil and w==e")
lua.execute(combined.decode('utf-8'),'Olympus',lua.globals().ns)
lua.execute('actualBridge=OlympusBridge.GetCensusSnapshot; C=OlympusVerifyCensus; reset()')
check('Session starts opted out',"local s,e=C.Preview();return s==nil and e=='session_opt_in_required'")
check('Actual Data constants match all copied limits',"return ns.Data.FRESH==900 and ns.Data.TOTAL_KEEP==86400 and ns.Data.KEEP==604800 and ns.Data.MAX_GUILDS==300")
check('Actual Data -> Bridge -> adapter preview',"C.SetEnabled(true);local s=C.Preview();return #s.guilds==1 and s.guilds[1].online==10 and s.observedAt==tick and s.guilds[1].receivedAt==tick and s.membershipProof==false")
check('Export requires preview',"C.SetEnabled(true);local s,e=C.Export();return s==nil and e=='preview_required'")
check('Preview return is defensive copy',"C.Preview().guilds[1].reportedCharacters=999;local wire,s=C.Export();return wire~=nil and s.guilds[1].reportedCharacters==100 and ns.rdb.guilds['Olympus Test'].total==100")
check('Export has no source private fields',"local wire=C.Export();return wire and not wire:find('PRIVATE_',1,true) and not wire:find('Council',1,true) and not wire:find('signingKey',1,true)")
check('Actual receipt clock differs from reporter clock',"local s=C.Preview();return s.guilds[1].receivedAt==ns.rdb.guilds['Olympus Test'].t and s.guilds[1].receivedAt~=ns.rdb.guilds['Olympus Test'].st")
check('Actual Summary excludes opted-out/nonfederation/expired rows',"ns.rdb.guilds['Olympus Hidden']=row(0).g;ns.rdb.guilds['Other Guild']=row(0).g;ns.rdb.guilds['Olympus Old']=row(604801).g;local s=C.Preview();return #s.guilds==1 and s.guilds[1].name=='Olympus Test'")
check('New upstream opt-out invalidates preview before export',"ns.Moderation.Guild=function()return {} end;local wire,e=C.Export();return wire==nil and e=='snapshot_changed_preview_again' and select(2,C.Export())=='preview_required'")
check('Valid empty complete snapshot distinct from refusal',"local s=C.Preview();return s and #s.guilds==0 and C.Export()~=nil")
check('Stream mask invalidates preview',"reset();C.SetEnabled(true);C.Preview();ns.CouncilMasked=function()return true end;return C.Export()==nil and select(2,C.Export())=='preview_required'")
check('Mask error refuses rather than exposing error text',"reset();C.SetEnabled(true);C.Preview();ns.CouncilMasked=function()error('PRIVATE_KEY')end;local s,e=C.Export();return s==nil and e=='upstream_unavailable_or_masked'")
check('Local clock rollback invalidates actual producer snapshot',"reset();C.SetEnabled(true);C.Preview();tick=tick-1;return C.Export()==nil")
for age in [0,900,901,86400,86401,604800]:
    check(f'Exact inclusive boundary age {age}',f"reset();ns.rdb.guilds['Olympus Test']=row({age}).g;C.SetEnabled(true);local s=C.Preview();local r=s.guilds[1];return r.fresh==({age}<=900) and r.counted==({age}<=86400) and (r.online~=nil)==({age}<=900)")
check('Expired valid upstream row omitted normally',"reset();ns.rdb.guilds['Olympus Test']=row(604801).g;C.SetEnabled(true);return #C.Preview().guilds==0")
check('Freshness transition requires new preview',"reset();ns.rdb.guilds['Olympus Test']=row(900).g;C.SetEnabled(true);C.Preview();tick=tick+1;return C.Export()==nil")
check('Unchanged content advances only export clock',"reset();C.SetEnabled(true);C.Preview();tick=tick+1;local wire,s=C.Export();return wire~=nil and s.observedAt==tick and s.guilds[1].receivedAt==tick-1")
check('Rollback after an intermediate poll invalidates export',"reset();C.SetEnabled(true);C.Preview();tick=tick+10;C.Recheck();tick=tick-1;return C.Recheck()==nil and C.Export()==nil")
check('Independent local receipt clock rollback invalidates export',"reset();C.SetEnabled(true);C.Preview();local oldClock=GetServerTime;GetServerTime=function()return tick+10 end;C.Recheck();GetServerTime=function()return tick+9 end;local s=C.Export();GetServerTime=oldClock;return s==nil")
check('Changed aggregate invalidates whole preview',"reset();C.SetEnabled(true);C.Preview();ns.rdb.guilds['Olympus Test'].total=101;return C.Export()==nil")
check('Session opt-out erases preview/export',"reset();C.SetEnabled(true);C.Preview();C.Export();C.SetEnabled(false);return C.Export()==nil and C.Preview()==nil")
check('Bridge exception invalidates snapshot without private reason',"reset();C.SetEnabled(true);C.Preview();OlympusBridge.GetCensusSnapshot=function()error('PRIVATE_KEY')end;local s,e=C.Export();return s==nil and e=='upstream_unavailable_or_masked'")
check('Method disappears without fallback',"reset();C.SetEnabled(true);C.Preview();OlympusBridge.GetCensusSnapshot=nil;local s,e=C.Export();return s==nil and e=='optional_upstream_method_unavailable' and forbidden==0")
lua.execute('reset()')
bad_cases=[
 ('unknown root field',"s.reporter='private'"),('unknown last row field',"s.guilds[1].reporter='private'"),
 ('top metatable',"setmetatable(s,{})"),('row metatable',"setmetatable(s.guilds[1],{})"),('array metatable',"setmetatable(s.guilds,{})"),
 ('sparse array',"s.guilds[2]=s.guilds[1];s.guilds[1]=nil"),('array string property',"s.guilds.extra=true"),
 ('future export',"s.observedAt=tick+1"),('future receipt',"s.guilds[1].receivedAt=tick+1"),('negative timestamp',"s.observedAt=-1"),
 ('NaN count',"s.guilds[1].reportedCharacters=0/0"),('infinite timestamp',"s.observedAt=math.huge"),('fractional count',"s.guilds[1].reportedCharacters=1.5"),
 ('count 1001',"s.guilds[1].reportedCharacters=1001"),('online exceeds total',"s.guilds[1].online=101"),('fresh online missing',"s.guilds[1].online=nil"),
 ('incorrect fresh',"s.guilds[1].fresh=false"),('incorrect counted',"s.guilds[1].counted=false"),('membership claim',"s.membershipProof=true"),
 ('wrong source',"s.source='server-attested'"),('wrong faction',"s.faction='Neutral'"),('empty name',"s.guilds[1].name=''"),
 ('ASCII control',"s.guilds[1].name='A'..string.char(31)..'B'"),('DEL',"s.realmGroup='A'..string.char(127)"),
 ('NUL',"s.addonVersion='A'..string.char(0)"),('129 UTF8 bytes',"s.guilds[1].name=string.rep('A',129)"),('33 version bytes',"s.addonVersion=string.rep('A',33)"),
 ('overlong UTF8',"s.guilds[1].name=string.char(192,175)"),('isolated continuation',"s.guilds[1].name=string.char(128)"),
 ('UTF8 surrogate',"s.guilds[1].name=string.char(237,160,128)"),('out of range UTF8',"s.guilds[1].name=string.char(244,144,128,128)"),
 ('truncated UTF8',"s.guilds[1].name=string.char(240,159,152)"),('expired supplied row',"s.guilds[1].receivedAt=tick-604801;s.guilds[1].fresh=false;s.guilds[1].counted=false;s.guilds[1].online=nil"),
 ('stale online present',"s.guilds[1].receivedAt=tick-901;s.guilds[1].fresh=false"),
 ('case duplicate',"s.guilds[2]={name='OLYMPUS TEST',reportedCharacters=100,receivedAt=tick,fresh=true,counted=true,online=10}"),
]
for name,mutation in bad_cases:check('Reject '+name,'local s=valid();'+mutation+';return C.Validate(s,tick)==nil')
check('128 UTF8 bytes accepted; 130 rejected',"local s=valid();s.guilds[1].name=string.rep(string.char(195,169),64);local a=C.Validate(s,tick);s.guilds[1].name=s.guilds[1].name..string.char(195,169);return a~=nil and C.Validate(s,tick)==nil")
check('UTF8 four-byte codepoint boundary accepted',"local s=valid();s.guilds[1].name=string.rep(string.char(240,159,152,128),32);return C.Validate(s,tick)~=nil")
check('ASCII case folding does not silently normalize Unicode',"local s=valid();s.guilds[1].name=string.char(195,137);s.guilds[2]={name=string.char(195,169),reportedCharacters=0,online=0,receivedAt=tick,fresh=true,counted=true};return C.Validate(s,tick)~=nil")
check('Largest permitted timestamp uses integer JSON',"local s=valid();s.observedAt=253402300799;s.guilds[1].receivedAt=s.observedAt;return C.Validate(s,253402300799)~=nil and C.Validate(s,253402300800)==nil")
check('Exactly 300 actual upstream rows accepted',"reset();ns.rdb.guilds={};for i=1,300 do ns.rdb.guilds['Olympus '..i]=row(0).g end;C.SetEnabled(true);local s=C.Preview();return s and #s.guilds==300 and #C.Export()<196608")
check('301 rows refused without partial export',"ns.rdb.guilds['Olympus 301']=row(0).g;return C.Preview()==nil and C.Export()==nil")
check('Maximum-width pipe-safe actual producer export fits bound',"reset();tick=253402300799;ns.group=string.rep('|',128);ns.VERSION=string.rep('|',32);ns.rdb.guilds={};for i=1,300 do local name=string.format('Olympus %03d',i)..string.rep('|',117);ns.rdb.guilds[name]=row(0).g;ns.rdb.guilds[name].total=1000;ns.rdb.guilds[name].online=1000 end;C.SetEnabled(true);local s=C.Preview();largeExport=C.Export();return s and #s.guilds==300 and largeExport and #largeExport>196608 and #largeExport<=327680 and not largeExport:find('|',1,true)")
lua.execute('reset()')
check('Malformed final row refuses complete snapshot',"reset();local s=valid();for i=2,300 do s.guilds[i]={name='Olympus '..i,reportedCharacters=100,online=10,receivedAt=tick,fresh=true,counted=true} end;s.guilds[300].reportedCharacters=1001;return C.Validate(s,tick)==nil")
check('Caller return mutation cannot modify source or future copies',"local s=valid();local a=C.Validate(s,tick);a.guilds[1].name='Altered';return s.guilds[1].name=='Olympus Test' and C.Validate(s,tick).guilds[1].name=='Olympus Test'")
check('Existing slash commands still delegate',"SlashCmdList.OLYMPUSVERIFY('status');return delegated==1")
check('Actual command preview creates attended window',"reset();C.Command('on');SlashCmdList.OLYMPUSVERIFY('census preview');local w=censusWindow();return w and w:IsShown() and w.copy:GetText()=='' and w.body:GetText():find('Unsigned community observations',1,true)")
check('Actual export button sets copy field',"local w=censusWindow();for _,f in ipairs(frames)do if f.text=='Export aggregate JSON' then f.scripts.OnClick(f) end end;return w.copy:GetText():find('olympus-census-v1',1,true)~=nil")
check('Visible window recheck clears on actual opt-out',"ns.Moderation.Guild=function()return {} end;local w=censusWindow();w.scripts.OnUpdate(w,1.1);return not w:IsShown() and w.copy:GetText()=='' and C.Export()==nil")
check('Pipe markup escaped in aggregate preview',"reset();ns.rdb.guilds={['Olympus |Hmalicious|hName|h']=row(0).g};C.Command('on');C.Command('preview');return censusWindow().body:GetText():find('Olympus ||Hmalicious||hName||h',1,true)~=nil")
check('Copy JSON escapes pipes without changing decoded names',"local wire,s=C.Export();return wire~=nil and not wire:find('|',1,true) and wire:find('\\\\u007cHmalicious',1,true)~=nil and s.guilds[1].name=='Olympus |Hmalicious|hName|h'")
check('Entering addon preview clears visible copy before upstream read',"C.Command('export');local called=0;OlympusBridge.GetCensusSnapshot=function()called=called+1;return actualBridge()end;OlympusVerifyPreview={State=function()return {} end};local w=censusWindow();w.scripts.OnUpdate(w,1.1);OlympusVerifyPreview=nil;OlympusBridge.GetCensusSnapshot=actualBridge;return not w:IsShown() and w.copy:GetText()=='' and called==0 and C.Export()==nil")
check('Entering UI preview clears visible copy before upstream read',"C.Command('preview');C.Command('export');OlympusVerifyUI={preview={}};local w=censusWindow();w.scripts.OnUpdate(w,1.1);OlympusVerifyUI=nil;return not w:IsShown() and w.copy:GetText()=='' and C.Export()==nil")
check('Combat direct recheck clears copy without awaiting event',"C.Command('preview');local old=InCombatLockdown;InCombatLockdown=function()return true end;local s=C.Recheck();InCombatLockdown=old;return s==nil and not censusWindow():IsShown()")
check('Window close clears internal preview',"censusWindow():Hide();return C.Export()==nil")
check('Addon preview state refuses census reads',"reset();C.Command('on');OlympusVerifyPreview={State=function()return {} end};C.Command('preview');OlympusVerifyPreview=nil;return C.Export()==nil")
check('Addon UI preview state refuses census reads',"OlympusVerifyUI={preview={}};C.Command('preview');OlympusVerifyUI=nil;return C.Export()==nil")
check('Combat event clears displayed copy',"C.Command('preview');C.Command('export');for _,f in ipairs(frames)do if f.events.PLAYER_REGEN_DISABLED then f.scripts.OnEvent(f,'PLAYER_REGEN_DISABLED') end end;return C.Export()==nil and censusWindow().copy:GetText()==''")
check('Logout resets opt-in',"C.Command('preview');for _,f in ipairs(frames)do if f.events.PLAYER_LOGOUT then f.scripts.OnEvent(f,'PLAYER_LOGOUT') end end;return select(2,C.Preview())=='session_opt_in_required'")
check('No direct consumer SavedVariables/network/Council/native roster side effects',"return forbidden==0 and next(OlympusVerifyDB)==nil and next(OlympusDB)==nil")
check('Existing upstream Summary lazy seen initialization is acknowledged',"reset();ns.rdb.seen=nil;C.SetEnabled(true);C.Preview();return type(ns.rdb.seen)=='table' and next(ns.rdb.seen)==nil")
lua.execute("reset();ns.rdb.guilds['Olympus Stale']=row(901).g;ns.rdb.guilds['Olympus History']=row(86401).g;ns.rdb.guilds['Olympus Hidden']=row(0).g;C.SetEnabled(true);C.Preview();exportWire=C.Export()")
wire=lua.globals().exportWire
assert isinstance(wire,str)
(run/'actual-bridge-consumer-export.json').write_text(wire,encoding='utf-8')
(run/'actual-bridge-consumer-maximum-export.json').write_text(lua.globals().largeExport,encoding='utf-8')
data=json.loads(wire);assert len(data['guilds'])==3 and 'PRIVATE_' not in wire
after=all(sha(Path(p['path']))==p['sha256'] for p in pins) and all(sha(Path(p))==h for p,h in before.items())
receipt={'recordedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'luaVersion':lua.eval('_VERSION'),'sourcePins':before,'checks':checks,'passed':sum(c['pass'] for c in checks),'total':len(checks),'allInputsUnchanged':after,'syntheticOnly':True,'actualBridgeAndData':True,'installed':False,'inGameVisualQualified':False,'network':False,'serverOrUploadQualifiedByThisRun':False,'export':{'path':str(run/'actual-bridge-consumer-export.json'),'sha256':sha(run/'actual-bridge-consumer-export.json')},'maximumExport':{'path':str(run/'actual-bridge-consumer-maximum-export.json'),'sha256':sha(run/'actual-bridge-consumer-maximum-export.json'),'bytes':(run/'actual-bridge-consumer-maximum-export.json').stat().st_size}}
assert all(sha(Path(p))==h for p,h in tool_before.items())
receipt.update({'checkoutInputs':{str(Path(p).relative_to(ROOT).as_posix()):h for p,h in before.items()},'fixturePinsSHA256':sha(FIXTURES/'pins.json'),'upstreamCommit':spec['upstream']['commit'],'upstreamInputs':pins,'combinedBridgeSHA256':hashlib.sha256(combined).hexdigest(),'toolingPins':tool_before,'pythonVersion':sys.version,'lupaVersion':lupa.__version__,'networkScope':'consumer runtime only','upstreamAcquisitionNetwork':args.fetch_upstream})
(run/'run-receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
print(json.dumps({'passed':receipt['passed'],'total':receipt['total'],'allInputsUnchanged':after,'evidence':str(run)}))
sys.exit(0 if receipt['passed']==receipt['total'] and after else 1)

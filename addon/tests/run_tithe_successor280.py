from pathlib import Path
import argparse,contextlib,json,hashlib,time,sys
from lupa.luajit21 import LuaRuntime
parser=argparse.ArgumentParser();parser.add_argument('--evidence',type=Path,required=True);parser.add_argument('--source-root',type=Path);args=parser.parse_args()
workspace=Path(__file__).resolve().parents[2];root=args.source_root or workspace;tests=root/'addon/tests';args.evidence.mkdir(parents=True,exist_ok=True)
paths=[root/'addon/OlympusVerify'/p for p in ['OlympusVerifyTreasury.lua','OlympusVerifyLive242.lua','Libs/OlympusHmac.lua']]+[tests/p for p in ['test_live242.lua','test_live_safety280.lua','test_tithe_successor280.lua','run_tithe_successor280.py','wow_mock.lua']]
pins={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
prefix=(tests/'test_live242.lua').read_text(encoding='utf-8').split('\ndo\n',1)[0]
helpers=(tests/'test_live_safety280.lua').read_text(encoding='utf-8').split('\ndo\n',1)[0]
lua=LuaRuntime(unpack_returned_tuples=True);lua.globals().LIVE280_NOW=int(time.time())
with contextlib.chdir(tests):raw=lua.execute(prefix+'\n'+helpers+'\n'+(tests/'test_tithe_successor280.lua').read_text(encoding='utf-8'))
def plain(v):
 if not hasattr(v,'items'):return v
 items=list(v.items())
 return [plain(v[i]) for i in range(1,len(items)+1)] if items and all(type(k)is int for k,_ in items) else {k:plain(x) for k,x in items}
report=plain(raw);report['inputs']=pins;report['sourceUnchanged']=all(hashlib.sha256(p.read_bytes()).hexdigest()==pins[str(p.relative_to(root))] for p in paths)
sys.path.insert(0,str(workspace/'watcher/tests'));import test_tithe_policy280 as support
body=report.pop('oldMail');original=report.pop('oldMailBefore');first=support.intake242._canonical_body(original);second=support.intake242._canonical_body(body)
report['realWatcherOldMailDigest']=first[1];report['realWatcherDigestStable']=first==second
(args.evidence/'result.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(f"{report['passed']}/{report['checks']} actual Lua successor checks")
raise SystemExit(report['passed']!=report['checks'] or not report['sourceUnchanged'] or not report['realWatcherDigestStable'])

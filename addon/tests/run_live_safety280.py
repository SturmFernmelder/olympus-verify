"""Actual Lua source plus synthetic native APIs; bounded Live admission/correlation/mail review."""
from pathlib import Path
import argparse,contextlib,hashlib,json,time,sys
from lupa.luajit21 import LuaRuntime

parser=argparse.ArgumentParser();parser.add_argument('--evidence',type=Path,required=True);parser.add_argument('--source-root',type=Path);args=parser.parse_args()
workspace=Path(__file__).resolve().parents[2];root=args.source_root or workspace;tests=root/'addon/tests';args.evidence.mkdir(parents=True,exist_ok=True)
inputs=[root/'addon/OlympusVerify'/p for p in ['OlympusVerify.lua','OlympusVerifyLive242.lua','OlympusVerifyLocalPrivacy280.lua','Libs/OlympusHmac.lua']]
inputs += [tests/p for p in ['wow_mock.lua','test_live242.lua','test_slash_registration234.lua','test_live_safety280.lua','run_live_safety280.py']]
pins={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}
source=(tests/'test_live242.lua').read_text(encoding='utf-8').split('\ndo\n',1)[0]
core=(tests/'test_slash_registration234.lua').read_text(encoding='utf-8').split('\nfor _,mode',1)[0].replace('local function fixture(', 'local function coreFixture(')
lua=LuaRuntime(unpack_returned_tuples=True);lua.globals().LIVE280_NOW=int(time.time());start=time.monotonic()
try:
 with contextlib.chdir(tests): result=lua.execute(source+'\n'+core+'\n'+(tests/'test_live_safety280.lua').read_text(encoding='utf-8'))
 def plain(v):
  if hasattr(v,'items'):
   pairs=list(v.items())
   if pairs and all(type(k) is int for k,_ in pairs):return [plain(v[i]) for i in range(1,len(pairs)+1)]
   return {k:plain(x) for k,x in pairs}
  return v
 report=plain(result);report['seconds']=time.monotonic()-start;report['inputHashes']=pins
 if report.get('pipelineRow'):
  sys.path.insert(0,str(workspace/'watcher/tests'))
  import test_tithe_policy280 as support
  f=support.TithePolicyTests();f.setUp()
  try:
   original=report['pipelineRow'];f.write({original['id']:original})
   support.intake242.collect(f.w);support.intake242.drain(f.w,collect_inputs=False)
   sent=f.calls[0][2]['entries'][0]
   assert sent=={k:v for k,v in original.items() if k!='status'}
   assert 'nativeMembership' not in sent
   target=args.evidence/'producer-watcher-vector.json';target.write_text(json.dumps(sent,ensure_ascii=False,sort_keys=True)+'\n',encoding='utf-8')
   report['actualWatcherPipeline']={'unchanged':True,'vectorSHA256':hashlib.sha256(target.read_bytes()).hexdigest(),'nativeProofInvented':False,
    'inputs':{p:hashlib.sha256((workspace/p).read_bytes()).hexdigest() for p in ['watcher/intake242.py','watcher/intake_schema280.py','watcher/watcher.py','watcher/tests/test_tithe_policy280.py']}}
  finally:f.doCleanups()
 report['sourceUnchanged']=all(hashlib.sha256(p.read_bytes()).hexdigest()==pins[str(p.relative_to(root))] for p in inputs)
 (args.evidence/'result.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
 print(f"{report['passed']}/{report['checks']} actual Lua checks; {report['seconds']:.3f}s")
 raise SystemExit(report['passed']!=report['checks'] or not report['sourceUnchanged'])
except Exception as error:
 (args.evidence/'error.json').write_text(json.dumps({'error':str(error),'inputHashes':pins,'seconds':time.monotonic()-start},indent=2)+'\n',encoding='utf-8')
 raise

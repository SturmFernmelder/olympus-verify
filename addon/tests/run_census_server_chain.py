from pathlib import Path
import argparse,datetime,hashlib,json,shutil,subprocess,sys
ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description='Validate the exact fresh pinned Lua exports with the actual strict server test.')
parser.add_argument('--lua-receipt',required=True,type=Path)
parser.add_argument('--evidence-root',required=True,type=Path)
parser.add_argument('--run-dir',required=True,type=Path)
parser.add_argument('--node',type=Path)
args=parser.parse_args()
node_value=str(args.node) if args.node else shutil.which('node')
if not node_value:raise SystemExit('Existing Node executable required.')
NODE=Path(node_value).resolve()
TEST=ROOT/'worker/tests/community_census_validator_test.cjs'
SOURCE=ROOT/'worker/src/community-census-validator.ts'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
before={str(p):sha(p) for p in [TEST,SOURCE,Path(__file__)]}
run=args.run_dir.resolve();run.mkdir(parents=True,exist_ok=False)
lua_receipt_path=args.lua_receipt.resolve()
assert lua_receipt_path.is_relative_to(args.evidence_root.resolve())
lua_receipt_hash=sha(lua_receipt_path)
lua_receipt=json.loads(lua_receipt_path.read_text(encoding='utf-8'))
assert lua_receipt['passed']==lua_receipt['total'] and lua_receipt['allInputsUnchanged']
assert lua_receipt['total']==89 and lua_receipt['luaVersion']=='Lua 5.1' and lua_receipt['lupaVersion']=='2.8'
spec_path=ROOT/'addon/tests/fixtures/community-census/pins.json'
spec=json.loads(spec_path.read_text(encoding='utf-8'))
assert lua_receipt['fixturePinsSHA256']==sha(spec_path)
assert set(lua_receipt['checkoutInputs'])==set(spec['checkoutInputPaths'])
assert all(sha(ROOT/rel)==pin for rel,pin in lua_receipt['checkoutInputs'].items())
assert lua_receipt['upstreamCommit']==spec['upstream']['commit']
assert lua_receipt['combinedBridgeSHA256']==spec['combinedBridgeSHA256']
assert lua_receipt['actualBridgeAndData'] and lua_receipt['syntheticOnly']
assert not lua_receipt['installed'] and not lua_receipt['inGameVisualQualified']
assert not lua_receipt['network'] and not lua_receipt['serverOrUploadQualifiedByThisRun']
export=Path(lua_receipt['export']['path']);assert sha(export)==lua_receipt['export']['sha256']
assert export.resolve().is_relative_to(lua_receipt_path.parent)
assert Path(lua_receipt['maximumExport']['path']).resolve().is_relative_to(lua_receipt_path.parent)
node_before=sha(NODE)
snapshot=json.loads(export.read_text(encoding='utf-8'));now=snapshot['observedAt']
records=[]

def invoke(label,args):
    result=subprocess.run([str(NODE),str(TEST),*args],capture_output=True,text=True,encoding='utf-8',errors='strict',timeout=60)
    (run/(label+'.stdout.txt')).write_text(result.stdout,encoding='utf-8')
    (run/(label+'.stderr.txt')).write_text(result.stderr,encoding='utf-8')
    records.append({'label':label,'command':[str(NODE),str(TEST),*args],'exitCode':result.returncode,'stdoutSHA256':sha(run/(label+'.stdout.txt')),'stderrSHA256':sha(run/(label+'.stderr.txt'))})
    return result
suite=invoke('pure-server-suite',[])
at=invoke('actual-lua-export-at-receipt',['--json',str(export),'--now',str(now)])
aged=invoke('actual-lua-export-after-seven-days',['--json',str(export),'--now',str(now+604801)])
future=invoke('actual-lua-export-before-export-clock',['--json',str(export),'--now',str(now-1)])
maximum=Path(lua_receipt['maximumExport']['path']);assert sha(maximum)==lua_receipt['maximumExport']['sha256']
large=invoke('actual-lua-maximum-export',['--json',str(maximum),'--now','253402300799'])
a=json.loads(at.stdout);b=json.loads(aged.stdout);c=json.loads(future.stdout)
d=json.loads(large.stdout)
checks={
 'pureServerSuite':suite.returncode==0,
 'actualLuaJsonAccepted':at.returncode==0 and a['ok'] and a['snapshot']==snapshot,
 'historicalSnapshotNotRewritten':aged.returncode==0 and b['ok'] and b['snapshot']==snapshot,
 'historicalRowsNotCurrent':all(not r['fresh'] and not r['counted'] and not r['retained'] for r in b['atReceipt']['guilds']),
 'futureExportRejected':future.returncode==2 and c=={'ok':False,'reason':'future_snapshot'},
 'maximumActualExportAccepted':large.returncode==0 and d['ok'] and d['snapshot']==json.loads(maximum.read_text(encoding='utf-8')) and len(d['snapshot']['guilds'])==300,
 'allOwnInputsUnchanged':all(sha(Path(p))==h for p,h in before.items()),
 'actualLuaExportUnchanged':sha(export)==lua_receipt['export']['sha256'],
}
assert sha(lua_receipt_path)==lua_receipt_hash
assert sha(maximum)==lua_receipt['maximumExport']['sha256']
assert all(sha(ROOT/rel)==pin for rel,pin in lua_receipt['checkoutInputs'].items())
assert sha(NODE)==node_before
receipt={'recordedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checks':checks,'passed':all(checks.values()),'commands':records,'sourcePins':before,'luaReceipt':str(lua_receipt_path),'luaReceiptSHA256':sha(lua_receipt_path),'actualLuaExportSHA256':sha(export),'syntheticOnly':True,'routeOrPersistenceCreated':False,'upstreamAdopted':False,'deployed':False}
receipt.update({'nodeExecutableSHA256':node_before,'checkoutInputs':lua_receipt['checkoutInputs'],'maximumExportSHA256':sha(maximum),'portableUbuntuCIQualified':False})
(run/'server-chain-receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
print(json.dumps({'passed':receipt['passed'],'checks':checks,'evidence':str(run)}))
sys.exit(0 if receipt['passed'] else 1)

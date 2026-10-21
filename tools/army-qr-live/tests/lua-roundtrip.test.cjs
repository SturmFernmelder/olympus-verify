'use strict';
// Fixed synthetic Lua serializer + owned QR encoder -> actual jsQR -> v2 browser protocol.
// No game, installed addon, file fixture output, network, browser permission or real observations.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const legacy=require('../../guild-qr-pilot/protocol.js');
const jsQR=require('../../guild-qr-pilot/vendor/jsqr-1.4.0.js');
const ROOT=path.resolve(__dirname,'../../..'),NOW=1792490000,NONCE='0123456789abcdef0123456789abcdef';
// Shipping assets live under the Worker's ESM package; execute their browser-global branch.
const browser={TextEncoder,TextDecoder,Uint8Array,Number,Array,Object,JSON,Error,Date,btoa,atob,crypto:globalThis.crypto,performance:globalThis.performance};
vm.runInNewContext(fs.readFileSync(path.join(ROOT,'worker/public/static/army-live/protocol.js'),'utf8'),browser,{filename:'actual-shipping-army-protocol.js'});
const P=browser.OlympusGuildQRProtocol;
const PYTHON=process.env.OLYMPUS_LUA_PYTHON||(process.platform==='win32'?'python':'python3');
const PROGRAM=String.raw`
import json,sys
from pathlib import Path
from lupa.luajit21 import LuaRuntime
if len(sys.argv)!=2: raise ValueError('arguments')
root=Path(sys.argv[1]).resolve()
lua=LuaRuntime(unpack_returned_tuples=True,encoding=None,register_eval=False,register_builtins=False)
for name in ('Core.lua','Libs/StatsPilotQr.lua','Army.lua'):
    lua.execute((root/'addon/OlympusStatsPilot'/name).read_bytes())
army=lua.globals()[b'OlympusStatsPilot'][b'Army']
encode=lua.globals()[b'OlympusStatsPilotQr'][b'Encode']
nonce=b'0123456789abcdef0123456789abcdef'
out=[]
for scenario in ('complete','small','withheld'):
    few=scenario=='small'
    snapshot=lua.table_from({b'guild':b'Synthetic Army Guild',b'realmGroup':b'Synthetic Army Realm',b'faction':b'Alliance',b'observedAt':1792490000,b'members':3 if few else 90,b'online':1 if few else 45,
      b'classes':lua.table_from([3,0,0,0,0,0,0,0,0] if few else [10]*9),b'levels':lua.table_from([0,0,0,0,0,0,3 if few else 90]),b'ranks':lua.table_from([3,0,0,0,0,0,0,0,0,0] if few else [9]*10)})
    if scenario=='withheld':
        snapshot[b'classes']=None
        snapshot[b'levels']=lua.table_from([1,0,0,0,0,0,89])
        snapshot[b'ranks']=lua.table_from([8]*10)
    body=army[b'Serialize'](snapshot)
    if not isinstance(body,bytes): raise ValueError('serialize')
    frames=army[b'Frames'](body,nonce)
    if not hasattr(frames,'items'): raise ValueError('frames')
    results=[]
    for i in range(1,len(frames)+1):
        frame=frames[i]
        matrix=encode(frame)
        if matrix is None or isinstance(matrix,tuple): raise ValueError('encode')
        results.append({'frame':frame.decode('ascii'),'matrix':[''.join('1' if matrix[y][x] else '0' for x in range(49)) for y in range(49)]})
    out.append({'scenario':scenario,'canonical':body.decode('utf-8'),'parts':results})
answer=json.dumps(out,separators=(',',':'))
if len(answer)>131072: raise ValueError('output')
sys.stdout.write(answer)
`;
let passed=0,failed=0;
async function check(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+': '+error.stack);}}
function expected(scenario){const few=scenario==='small',withheld=scenario==='withheld';return{format:'olympus-stat-observation-v2',scope:'own-guild',source:'volunteer-client',sourceVerified:false,membershipProof:false,addonVersion:'0.2.0',realmGroup:'Synthetic Army Realm',faction:'Alliance',observedAt:NOW,guilds:[{name:'Synthetic Army Guild',receivedAt:NOW,reportedCharacters:few?'few':90,online:few?null:45,classes:few||withheld?null:Array(9).fill(10),levels:few||withheld?null:[0,0,0,0,0,0,90],ranks:few||withheld?null:Array(10).fill(9)}]};}
function independentFrames(body){const raw=Buffer.from(body),hash=crypto.createHash('sha256').update(raw).digest('base64url'),out=[];for(let at=0;at<raw.length;at+=75)out.push('OLCS2|'+NONCE+'|'+hash+'|'+String(at/75+1).padStart(3,'0')+'|'+String(Math.ceil(raw.length/75)).padStart(3,'0')+'|'+raw.subarray(at,at+75).toString('base64url'));return out;}
function pixels(matrix){assert.equal(matrix.length,49);for(const row of matrix)assert.match(row,/^[01]{49}$/);const side=342,out=new Uint8ClampedArray(side*side*4);out.fill(255);for(let y=0;y<49;y++)for(let x=0;x<49;x++)if(matrix[y][x]==='1')for(let sy=0;sy<6;sy++)for(let sx=0;sx<6;sx++){const p=(((y+4)*6+sy)*side+(x+4)*6+sx)*4;out[p]=0;out[p+1]=0;out[p+2]=0;}return out;}
function decoder(){const messages=[],scope={ArrayBuffer,Uint8Array,Uint8ClampedArray,Number,Error,jsQR,self:{postMessage:message=>messages.push(message)}};scope.importScripts=name=>assert.equal(name,'../qr-vendor/jsqr-1.4.0.js');vm.runInNewContext(fs.readFileSync(path.join(ROOT,'worker/public/static/army-live/decoder.js'),'utf8'),scope,{filename:'actual-shipping-army-decoder.js'});return{decode(image,id){scope.self.onmessage({data:{type:'decode',id,generation:4,width:342,height:342,buffer:image.buffer}});assert.equal(messages.length,1);return messages.pop();}};}
(async()=>{
 console.log('COMMAND '+process.execPath+' '+__filename);console.log('PROVENANCE fixed fictional source inputs; actual reviewed Lua and actual jsQR; memory-only matrices; no game or provider');
 const render=spawnSync(PYTHON,['-E','-P','-B','-c',PROGRAM,ROOT],{encoding:'utf8',timeout:8000,maxBuffer:262144,windowsHide:true,cwd:ROOT});
 let fixtures;
 await check('bounded synthetic renderer executes current Core, Army and fixed 49x49 encoder',()=>{assert.equal(render.error,undefined);assert.equal(render.status,0,render.stderr);assert.equal(render.stderr,'');fixtures=JSON.parse(render.stdout);assert.deepEqual(fixtures.map(value=>value.scenario),['complete','small','withheld']);});
 if(!fixtures)throw Error('No valid synthetic fixture result; no retry attempted.');
 for(const fixture of fixtures){
  const payload=expected(fixture.scenario);
  await check(fixture.scenario+' serializer matches independent exact canonical bytes and full frames',()=>{assert.equal(fixture.canonical,JSON.stringify(payload));assert.deepEqual(fixture.parts.map(part=>part.frame),independentFrames(fixture.canonical));assert.ok(Buffer.byteLength(fixture.canonical)<=P.LIMITS.payloadBytes);assert.ok(fixture.parts.length<=P.LIMITS.parts);assert.deepEqual(P.validatePayload(Buffer.from(fixture.canonical),{nowSeconds:NOW}),payload);});
  const decoded=[];
  await check(fixture.scenario+' every actual Lua QR matrix decodes through shipping worker and clears pixels',()=>{const worker=decoder();for(const part of fixture.parts){const image=pixels(part.matrix);const result=worker.decode(image,decoded.length+1);assert.equal(result.type,'decoded');assert.equal(result.text,part.frame);assert.ok(result.text.length<=191);assert.ok(image.every(value=>value===0));decoded.push(result.text);}assert.equal(decoded.length,fixture.parts.length);});
  await check(fixture.scenario+' reverse-order pixel results assemble complete frozen v2 distribution DTO',async()=>{const a=P.createAssembler({nonce:NONCE,clock:()=>NOW*1000,monotonicClock:()=>0});let result;for(const frame of [...decoded].reverse())result=await a.add(frame);assert.equal(result.status,'complete');assert.deepEqual(result.payload,payload);assert.ok(Object.isFrozen(result.payload));assert.ok(Object.isFrozen(result.payload.guilds[0]));for(const key of ['classes','levels','ranks'])if(result.payload.guilds[0][key])assert.ok(Object.isFrozen(result.payload.guilds[0][key]));assert.equal(a.progress.received,0);});
  await check(fixture.scenario+' v1 and identity namespaces remain rejected and missing pieces stay private',async()=>{assert.throws(()=>legacy.parseFrame(decoded[0]));for(const prefix of ['OLCS1','OLG1','OLG2'])assert.throws(()=>P.parseFrame(decoded[0].replace(/^OLCS2/,prefix)));const a=P.createAssembler({nonce:NONCE,clock:()=>NOW*1000,monotonicClock:()=>0});for(const frame of decoded.slice(0,-1)){const result=await a.add(frame);assert.equal(result.status,'pending');assert.equal(result.payload,undefined);}a.clear();await assert.rejects(a.add(decoded.at(-1)),/ended/);});
 }
 await check('shipping v2 protocol exactly matches reviewed source and retains fixed limits',()=>{const protocol=fs.readFileSync(path.join(ROOT,'tools/army-qr-live/protocol.js'));assert.deepEqual(fs.readFileSync(path.join(ROOT,'worker/public/static/army-live/protocol.js')),protocol);assert.ok(!protocol.toString('utf8').includes('require('));assert.equal(P.LIMITS.payloadBytes,1023);assert.equal(P.LIMITS.parts,14);assert.equal(P.LIMITS.captureMs,30000);assert.equal(P.LIMITS.sourceAgeSeconds,86400);assert.equal(P.LIMITS.onlineAgeSeconds,900);});
 console.log('\n'+passed+' passed, '+failed+' failed (Lua -> actual QR pixels -> v2, fictional memory-only)');if(failed)process.exitCode=1;
})().catch(error=>{console.error(error.stack);process.exitCode=1;});

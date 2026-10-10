const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.join(__dirname,'..'),lua=path.join(root,'..','addon','OlympusVerify','Libs','OlympusQr.lua');
// Existing approved interpreter, no package install. Lua emits only synthetic49-module fixture bytes.
const py=process.env.OLYMPUS_LUA_PYTHON;if(!py)throw Error('OLYMPUS_LUA_PYTHON required');
const payload='OLG1|'+'a'.repeat(32)+'|'+'b'.repeat(32)+'|Player-1234-00000002|Player-1234-00000001|1791660000|70205|16001|Other Member|OLYMPUS|Classic Beta PvP 2|7|1|Member';
const script="import sys,json\nfrom lupa.luajit21 import LuaRuntime\nl=LuaRuntime(unpack_returned_tuples=True)\nl.execute(open(sys.argv[1],encoding='utf-8').read())\nv,e=(None,None)\nv=l.globals().OlympusQr.Encode(sys.argv[2])\nif isinstance(v,tuple): raise Exception(v[1])\nprint(json.dumps([[bool(v[y][x]) for x in range(49)] for y in range(49)]))\n";
const run=cp.spawnSync(py,['-c',script,lua,payload],{encoding:'utf8',windowsHide:true});if(run.status!==0)throw Error(run.stderr);
const matrix=JSON.parse(run.stdout);assert.equal(matrix.length,49);assert(matrix.every(r=>r.length===49));const scale=6,size=(49+8)*scale,data=new Uint8ClampedArray(size*size*4);data.fill(255);
for(let y=0;y<49;y++)for(let x=0;x<49;x++)if(matrix[y][x])for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const o=(((y+4)*scale+dy)*size+(x+4)*scale+dx)*4;data[o]=data[o+1]=data[o+2]=0;}
const scope={};vm.runInNewContext(fs.readFileSync(path.join(root,'public/static/qr-vendor/jsqr-1.4.0.js'),'utf8'),{self:scope});const decoded=scope.jsQR(data,size,size,{inversionAttempts:'attemptBoth'});assert(decoded,'real jsQR must decode real Lua matrix');assert.equal(decoded.data,payload);console.log('PASS real49x49 Lua QR -> existing jsQR decoder exact byte parity');

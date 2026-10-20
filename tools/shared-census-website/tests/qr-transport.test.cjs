'use strict';
// Actual owned Lua encoder -> PNG bytes -> unchanged jsQR worker -> original protocol.
// Only the closed fictional registry and preset counts are generated.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {createFixture,SOURCE_PINS}=require('../qr-fixtures.cjs');
const protocol=require('../../guild-qr-pilot/protocol.js');
const jsQR=require('../../guild-qr-pilot/vendor/jsqr-1.4.0.js');
const ROOT=path.resolve(__dirname,'../../..'),NOW=1792530023,NONCE='0123456789abcdef0123456789abcdef';
const PYTHON=process.env.OLYMPUS_LUA_PYTHON||(process.platform==='win32'?'python':'python3');
let passed=0,failed=0;
async function check(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+': '+error.stack);}}
const options=(guildKey='guild-oak',scenario='fresh')=>({guildKey,scenario,nowSeconds:NOW,nonce:NONCE});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function rgba(png){
 assert.deepEqual(png.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
 let at=8,header=null,ended=false;const compressed=[];
 while(at<png.length){const length=png.readUInt32BE(at),kind=png.toString('ascii',at+4,at+8),data=png.subarray(at+8,at+8+length);assert.ok(at+12+length<=png.length);assert.equal(zlib.crc32(png.subarray(at+4,at+8+length)),png.readUInt32BE(at+8+length));
  if(kind==='IHDR'){assert.equal(header,null);header={width:data.readUInt32BE(0),height:data.readUInt32BE(4)};assert.deepEqual([...data.subarray(8)],[8,6,0,0,0]);}
  else if(kind==='IDAT')compressed.push(data);else if(kind==='IEND'){assert.equal(length,0);ended=true;}else throw Error('Unexpected PNG metadata chunk '+kind);at+=12+length;
 }
 assert.equal(ended,true);assert.equal(at,png.length);assert.deepEqual(header,{width:342,height:342});
 const rowSize=342*4,raw=zlib.inflateSync(Buffer.concat(compressed),{maxOutputLength:(rowSize+1)*342});assert.equal(raw.length,(rowSize+1)*342);
 const pixels=new Uint8ClampedArray(rowSize*342);for(let y=0;y<342;y++){assert.equal(raw[y*(rowSize+1)],0);pixels.set(raw.subarray(y*(rowSize+1)+1,(y+1)*(rowSize+1)),y*rowSize);}raw.fill(0);return pixels;
}
function decoder(){const messages=[],scope={ArrayBuffer,Uint8Array,Uint8ClampedArray,Number,Error,jsQR,self:{postMessage:message=>messages.push(message)}};scope.importScripts=name=>assert.equal(name,'./vendor/jsqr-1.4.0.js');vm.runInNewContext(fs.readFileSync(path.join(ROOT,'tools/guild-qr-pilot/decoder.js'),'utf8'),scope,{filename:'unchanged-owned-pilot-decoder.js'});return{decode(pixels,id){scope.self.onmessage({data:{type:'decode',id,generation:4,width:342,height:342,buffer:pixels.buffer}});assert.equal(messages.length,1);return messages.pop();}};}
function independentFrames(canonical,nonce){const raw=Buffer.from(canonical),digest=crypto.createHash('sha256').update(raw).digest('base64url'),frames=[];for(let at=0;at<raw.length;at+=75)frames.push('OLCS1|'+nonce+'|'+digest+'|'+String(at/75+1).padStart(3,'0')+'|'+String(Math.ceil(raw.length/75)).padStart(3,'0')+'|'+raw.subarray(at,at+75).toString('base64url'));return frames;}
(async()=>{
 console.log('COMMAND '+process.execPath+' '+__filename);console.log('PROVENANCE fixed synthetic inputs only; actual unchanged Lua/jsQR/protocol; no game, browser permission, provider or file fixture output');
 await check('protocol and owned Lua encoder remain exact unchanged pinned source',()=>{for(const[file,expected]of Object.entries(SOURCE_PINS))assert.equal(hash(fs.readFileSync(path.join(ROOT,file))),expected);});
 const all=new Map();
 for(const guildKey of ['guild-oak','guild-pine'])for(const scenario of ['fresh','masked','older','conflict'])await check(guildKey+' '+scenario+' realPNG roundtrip preserves exact source,masks and closed sharedobservation',async()=>{
  const fixture=await createFixture(options(guildKey,scenario));all.set(guildKey+':'+scenario,fixture);
  assert.equal(Object.isFrozen(fixture),true);assert.equal(Object.isFrozen(fixture.payload.guilds[0]),true);assert.equal(Object.isFrozen(fixture.observation),true);
  assert.equal(fixture.canonical,JSON.stringify(fixture.payload));assert.equal(fixture.payloadSHA256,hash(Buffer.from(fixture.canonical)));assert.deepEqual(fixture.frames,independentFrames(fixture.canonical,NONCE));
  const source=scenario==='older'?NOW-1800:Math.floor(NOW/60)*60,members=scenario==='masked'?'few':scenario==='conflict'?143:240,online=['masked','older'].includes(scenario)?null:scenario==='conflict'?67:60;
  assert.equal(fixture.payload.observedAt,source);assert.equal(fixture.payload.guilds[0].receivedAt,source);assert.equal(fixture.payload.guilds[0].name,guildKey==='guild-oak'?'Synthetic Oak':'Synthetic Pine');assert.equal(fixture.payload.guilds[0].reportedCharacters,members);assert.equal(fixture.payload.guilds[0].online,online);
  assert.deepEqual(fixture.observation,{format:'olympus-shared-census-observation-v1',source:'unverified-volunteer-client',sourceVerified:false,membershipProof:false,guildKey,addonVersion:'0.1.0',observedAt:source,sourceReceivedAt:source,capturedAt:NOW,completeRosterClaimed:true,reportedCharacters:members,reportedOnline:online});
  assert.equal(fixture.payload.realmGroup,'Synthetic Realm');assert.equal(fixture.payload.faction,'Alliance');assert.equal(fixture.images.length,fixture.frames.length);assert.ok(fixture.frames.length>=1&&fixture.frames.length<=14);assert.ok(Buffer.byteLength(fixture.canonical)<=1023);
  const worker=decoder(),decoded=[];
  for(let i=0;i<fixture.images.length;i++){
   const png=fixture.images[i];assert.ok(Buffer.isBuffer(png)&&png.length<=32768);assert.deepEqual(protocol.inspectImageHeader(png,'image/png',{fileBytes:png.length}),{width:342,height:342,mime:'image/png'});
   const pixels=rgba(png);for(const[y,x]of [[0,0],[23,200],[341,341],[200,318]])assert.deepEqual([...pixels.subarray((y*342+x)*4,(y*342+x)*4+4)],[255,255,255,255]);
   const response=worker.decode(pixels,i+1);assert.equal(response.type,'decoded');assert.equal(response.text,fixture.frames[i]);assert.equal(pixels.every(v=>v===0),true);decoded.push(response.text);
  }
  const assembler=protocol.createAssembler({nonce:NONCE,clock:()=>NOW*1000});let result;for(const frame of decoded.reverse())result=await assembler.add(frame);assert.equal(result.status,'complete');assert.deepEqual(result.payload,fixture.payload);
 });
 await check('missing frames never expose partial guild statistics',async()=>{const fixture=all.get('guild-oak:fresh'),a=protocol.createAssembler({nonce:NONCE,clock:()=>NOW*1000});for(const frame of fixture.frames.slice(0,-1)){const out=await a.add(frame);assert.equal(out.status,'pending');assert.equal(out.payload,undefined);}a.clear();await assert.rejects(a.add(fixture.frames.at(-1)),/ended/);});
 await check('mixing fixed Oak and Pine snapshots aborts rather than crossguildmerge',async()=>{const a=protocol.createAssembler({nonce:NONCE,clock:()=>NOW*1000});await a.add(all.get('guild-oak:fresh').frames[0]);await assert.rejects(a.add(all.get('guild-pine:fresh').frames[1]),/Mixed snapshot/);assert.equal(a.progress.received,0);});
 await check('a different browser nonce cannot adopt a generated fixture',async()=>{const a=protocol.createAssembler({nonce:'f'.repeat(32),clock:()=>NOW*1000});await assert.rejects(a.add(all.get('guild-oak:fresh').frames[0]),/another scan/);});
 await check('unknown labels,scenarios,extra fields and inheritedoptions are refused',async()=>{
  for(const input of [{...options(),guildKey:'guild-unreported'},{...options(),guildKey:'Real guild'},{...options(),scenario:'invalid-future'},{...options(),scenario:'custom'},{...options(),name:'arbitrary'},{...options(),frames:['OLG1|x']},Object.create(options())])await assert.rejects(createFixture(input));
 });
 await check('malformed clocks and nonces refuse before renderer invocation',async()=>{
  for(const nowSeconds of [-1,0,1799,1.5,NaN,Infinity,'1792530023',253402300800])await assert.rejects(createFixture({...options(),nowSeconds}));
  for(const nonce of ['',NONCE.toUpperCase(),'a'.repeat(31),'g'.repeat(32),null])await assert.rejects(createFixture({...options(),nonce}));
 });
 await check('identity OLG1/OLG2 namespaces cannot enter protocol or syntheticrenderer',()=>{
  for(const namespace of ['OLG1','OLG2']){const legacy=all.get('guild-oak:fresh').frames.map(frame=>frame.replace(/^OLCS1/,namespace));assert.throws(()=>protocol.parseFrame(legacy[0]));const result=spawnSync(PYTHON,['-E','-P','-B',path.join(__dirname,'../render-qr.py')],{input:JSON.stringify({frames:legacy}),encoding:'utf8',timeout:8000,maxBuffer:262144,windowsHide:true});assert.equal(result.status,1);assert.equal(result.stdout,'');assert.match(result.stderr,/^synthetic_qr_render_refused\r?\n$/);}
 });
 console.log('\n'+passed+' passed, '+failed+' failed (actual Lua QRPNG -> unchanged jsQRworker -> unchanged protocol, synthetic only)');if(failed)process.exitCode=1;
})().catch(error=>{console.error(error.stack);process.exitCode=1;});

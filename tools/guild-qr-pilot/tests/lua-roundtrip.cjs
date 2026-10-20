'use strict';
// Independent cross-language/QR integration oracle using wholly synthetic fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const protocol = require('../protocol.js');
const jsQR = require('../vendor/jsqr-1.4.0.js');
const dir = process.argv[2];
if (!dir) throw Error('Pass an explicit synthetic fixture directory from make-fixtures180.py');
const fixture = JSON.parse(fs.readFileSync(path.join(dir, 'fixture.json'), 'utf8'));
const matrices = JSON.parse(fs.readFileSync(path.join(dir, 'matrices.json'), 'utf8'));
let passed = 0;
function check(value, label) {assert.ok(value, label);passed++;console.log('PASS '+label);}
async function main() {
  const raw = Buffer.from(fixture.canonical, 'utf8');
  check(crypto.createHash('sha256').update(raw).digest('hex') === fixture.sha256, 'actual Lua SHA matches independent Node crypto');
  check(JSON.stringify(fixture.payload) === fixture.canonical, 'actual Lua output has exact JavaScript canonical JSON bytes');
  const independent = [];
  const hash = crypto.createHash('sha256').update(raw).digest('base64url');
  for (let i=0; i<raw.length; i+=75) independent.push('OLCS1|'+fixture.nonce+'|'+hash+'|'+String(i/75+1).padStart(3,'0')+'|'+String(Math.ceil(raw.length/75)).padStart(3,'0')+'|'+raw.subarray(i,i+75).toString('base64url'));
  assert.deepEqual(fixture.frames, independent);check(true, 'every actual Lua frame equals independent Node byte framing');
  const responses = [];
  const scope = {ArrayBuffer,Uint8Array,Uint8ClampedArray,Number,Error,jsQR,self:{postMessage:value=>responses.push(value)}};
  scope.importScripts = name => {assert.equal(name, './vendor/jsqr-1.4.0.js');};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../decoder.js'), 'utf8'), scope, {filename:'actual-statistics-decoder.js'});
  const decoded = [];
  for (let i=0; i<matrices.length; i++) {
    const grid = matrices[i], size = 342, pixels = new Uint8ClampedArray(size*size*4);
    for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
      const my=Math.floor(y/6)-4,mx=Math.floor(x/6)-4;
      const value=my>=0&&my<49&&mx>=0&&mx<49&&grid[my][mx]?0:255;
      pixels.set([value,value,value,255],(y*size+x)*4);
    }
    scope.self.onmessage({data:{type:'decode',id:i+1,generation:7,width:size,height:size,buffer:pixels.buffer}});
    const response = responses.pop();
    check(response.type === 'decoded' && response.text === fixture.frames[i], 'actual Lua QR image '+(i+1)+' decoded by actual separate browser worker/jsQR');
    check(pixels.every(x=>x===0), 'decoder clears all image pixels after frame '+(i+1));
    decoded.push(response.text);
  }
  const assembler=protocol.createAssembler({nonce:fixture.nonce,clock:()=>fixture.atUnix*1000});
  let final;
  for (const frame of decoded.reverse()) final=await assembler.add(frame);
  check(final.status==='complete', 'out-of-order decoded images reassemble as one complete snapshot');
  assert.deepEqual(final.payload,fixture.payload);check(true, 'final browser preview payload equals exact Lua aggregate and masks');
  const invalid=new Uint8Array(8);invalid.fill(77);
  scope.self.onmessage({data:{type:'decode',id:99,generation:8,width:4000,height:1,buffer:invalid.buffer}});
  check(responses.pop().type==='error'&&invalid.every(x=>x===0), 'invalid oversized decoder input is refused and cleared');
  console.log(`${passed} passed, 0 failed; synthetic actual Lua -> QR image -> jsQR worker -> strict protocol only`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});

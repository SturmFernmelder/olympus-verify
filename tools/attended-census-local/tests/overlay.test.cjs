'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {renderHTML,renderPilot}=require('../overlay.cjs');
const root=path.resolve(__dirname,'../..'),original=path.join(root,'guild-qr-pilot');
const html=fs.readFileSync(path.join(original,'index.html'),'utf8'),pilot=fs.readFileSync(path.join(original,'pilot.js'),'utf8');
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}
test('changed original QR pilot script refuses before overlay',()=>assert.throws(()=>renderPilot(pilot+' '),/bytes changed/));
test('changed original pilot HTML refuses before overlay',()=>assert.throws(()=>renderHTML(html+' '),/bytes changed/));
test('actual served pilot extension compiles as browser script',()=>assert.doesNotThrow(()=>new vm.Script(renderPilot(pilot))));
test('real-local handoff script compiles as browser script',()=>assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(path.join(__dirname,'../bridge.js'),'utf8'))));
test('served local page labels real data and fictional ownership without synthetic guild substitution',()=>{const result=renderHTML(html);assert.match(result,/Real addon · local only/);assert.match(result,/fictional Reporter A/);assert.doesNotMatch(result,/Synthetic Oak|Synthetic Pine/);assert.match(result,/local-consent/);assert.match(result,/local-recover/);});
test('original independent scan and source bounds remain in served script',()=>{const result=renderPilot(pilot);for(const guard of ['sourceFingerprint','settings.displaySurface !== \'window\'','performance.now() >= session.monotonicDeadline','document.hidden','stopReturnedTracks(selected)','sourceAgeSeconds','reviewMs'])assert.ok(result.includes(guard),guard);assert.match(result,/Math.min\(localScan.expiresAt, now \+ protocol.LIMITS.captureMs\)/);});
test('handoff records original canonical frames after original assembler validation',()=>{const result=renderPilot(pilot);assert.ok(result.indexOf('session.assembler.add(text)')<result.indexOf('session.localFrames.set('));assert.match(result,/bridge.decoded\(payload, Array.from\(session.localFrames.values\(\)\), session.localScan\)/);});
test('original source files remain byte-identical in memory and on disk',()=>{assert.equal(fs.readFileSync(path.join(original,'pilot.js'),'utf8'),pilot);assert.equal(fs.readFileSync(path.join(original,'index.html'),'utf8'),html);});
console.log(`${passed}/${passed} attended local overlay checks passed`);

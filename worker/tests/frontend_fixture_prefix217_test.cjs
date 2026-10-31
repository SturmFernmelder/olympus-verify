'use strict';
// Standalone focused controls, also reached by the unchanged frontend196 entry.
const assert217=require('node:assert/strict'),fs217=require('node:fs'),path217=require('node:path'),crypto217=require('node:crypto'),vm217=require('node:vm');
const {historicalFrontendPrefix217,historicalBoardNativePrefix217}=require('./frontend_fixture_prefix217.cjs');
const source217=fs217.readFileSync(path217.join(__dirname,'frontend_check.cjs'),'utf8');
const cuts217=[...source217.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
assert217.equal(cuts217.length,1,'the original unique fixture boundary is retained');
const current217=source217.slice(0,cuts217[0].index),original217=current217;
const hash217=value=>crypto217.createHash('sha256').update(value).digest('hex');
let checks217=0;
function check217(label,run){run();checks217++;console.log('PASS prefix217 '+label);}
check217('exact current prefix is checked before any historical hash comparison',()=>assert217.equal(hash217(current217),'05fafa7e0989e6ef29d432c9b53d99dcc22b00ac14a9d25526a7852798f75a04'));
const historical217=historicalFrontendPrefix217(current217);
check217('exact two-line inverse restores the unchanged historical authority as data',()=>{assert217.equal(hash217(historical217),'bd05ccad75ca07e71647d20b9169636ed1d73d33ee2bbb3a7c1e763a8121c1c5');assert217.equal(Buffer.byteLength(historical217),29077);assert217.equal(current217,original217);});
const currentLines217=current217.split('\n'),historicalLines217=historical217.split('\n');
const edits217=currentLines217.flatMap((line,index)=>line===historicalLines217[index]?[]:[line]);
assert217.equal(edits217.length,2);
check217('historical executable input is refused',()=>assert217.throws(()=>historicalFrontendPrefix217(historical217),/prefix_context_not_unique/));
check217('each duplicate reviewed context is refused',()=>{for(const line of edits217)assert217.throws(()=>historicalFrontendPrefix217(current217+line+'\n'),/prefix_context_not_unique/);});
check217('each missing reviewed context is refused',()=>{for(const line of edits217)assert217.throws(()=>historicalFrontendPrefix217(current217.replace(line+'\n','')),/prefix_context_not_unique/);});
check217('drift outside the two reviewed lines is refused',()=>assert217.throws(()=>historicalFrontendPrefix217(current217.replace('const walk =','const walk  =')),/current_prefix_drift/));
check217('extra bytes outside the pinned prefix are refused',()=>assert217.throws(()=>historicalFrontendPrefix217(current217+'\n// outside pinned prefix\n'),/current_prefix_drift/));
check217('wrong input type is refused',()=>assert217.throws(()=>historicalFrontendPrefix217(Buffer.from(current217)),/prefix_type/));
check217('full fixture body cannot replace the exact current prefix',()=>assert217.throws(()=>historicalFrontendPrefix217(source217),/current_prefix_drift/));
check217('actual current parser distinguishes unquoted attribute values',()=>{
 const start=current217.indexOf('function parseCompound(s) {'),end=current217.indexOf('\n}',start)+2;
 assert217.ok(start>=0&&end>start&&current217.indexOf('function parseCompound(s) {',start+1)===-1);
 // Only the pinned current pure selector parser executes. No historical inverse is evaluated.
 const parse=vm217.runInNewContext('('+current217.slice(start,end)+')');
 assert217.equal(parse('input[type=text]').attrs[0][1],'text');
 assert217.equal(parse('input[type=checkbox]').attrs[0][1],'checkbox');
});
const nativeSource217=fs217.readFileSync(path217.join(__dirname,'privacy_native_erasure_mode_test.cjs'),'utf8');
const nativeCuts217=[...nativeSource217.matchAll(/\(async\(\)=>\{\r?\n \/\/ \.174:/g)];
assert217.equal(nativeCuts217.length,1);
const nativeCurrent217=nativeSource217.slice(0,nativeCuts217[0].index),nativeLine217=nativeCurrent217.split('\n').find(line=>line.startsWith(' f.call=async('))+'\n';
const nativeHistorical217=historicalBoardNativePrefix217(nativeCurrent217);
check217('board Native exact current prefix maps to its original authority only as data',()=>{assert217.equal(hash217(nativeCurrent217),'572066b31422497e89314f47c972536517104de10521a45434b4f041f6ad02a3');assert217.equal(hash217(nativeHistorical217),'83b4fe71835e987ede23c482568ab067ce84700b51cca4b4efac6119f262896a');});
check217('board Native historical executable input is refused',()=>assert217.throws(()=>historicalBoardNativePrefix217(nativeHistorical217),/native_context_not_unique/));
check217('board Native duplicate reviewed form line is refused',()=>assert217.throws(()=>historicalBoardNativePrefix217(nativeCurrent217+nativeLine217),/native_context_not_unique/));
check217('board Native missing reviewed form line is refused',()=>assert217.throws(()=>historicalBoardNativePrefix217(nativeCurrent217.replace(nativeLine217,'')),/native_context_not_unique/));
check217('board Native unrelated prefix drift is refused',()=>assert217.throws(()=>historicalBoardNativePrefix217(nativeCurrent217+'\n// unreviewed\n'),/native_current_prefix_drift/));
check217('board Native full body and wrong input type are refused',()=>{assert217.throws(()=>historicalBoardNativePrefix217(nativeSource217),/native_current_prefix_drift/);assert217.throws(()=>historicalBoardNativePrefix217(Buffer.from(nativeCurrent217)),/native_prefix_type/);});
console.log(`${checks217}/${checks217} current frontend prefix controls passed`);

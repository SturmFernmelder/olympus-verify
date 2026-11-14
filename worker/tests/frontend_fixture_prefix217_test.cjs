'use strict';
// Standalone focused controls, also reached by the unchanged frontend196 entry.
const assert217=require('node:assert/strict'),fs217=require('node:fs'),path217=require('node:path'),crypto217=require('node:crypto'),vm217=require('node:vm');
const {historicalFrontendPrefix217,historicalBoardNativePrefix217,historicalTreasuryNativeFixture217}=require('./frontend_fixture_prefix217.cjs');
const source217=fs217.readFileSync(path217.join(__dirname,'frontend_check.cjs'),'utf8');
const cuts217=[...source217.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
assert217.equal(cuts217.length,1,'the original unique fixture boundary is retained');
const current217=source217.slice(0,cuts217[0].index),original217=current217;
const hash217=value=>crypto217.createHash('sha256').update(value).digest('hex');
let checks217=0;
function check217(label,run){run();checks217++;console.log('PASS prefix217 '+label);}
// 14 Nov 2026: our frontend_check.cjs migration (390f337/d92d021) inserted two blocks into this prefix (ParentNode.append;
// requestAnimationFrame and cancelAnimationFrame for the page sandbox). The helper records them as its first two inverse
// edits, pure removals. They are read from the helper's own source here, so this test and the helper cannot disagree
// about their bytes; without them the prefix must be exactly the one pinned before.
const helperSource217=fs217.readFileSync(path217.join(__dirname,'frontend_fixture_prefix217.cjs'),'utf8');
const inserted217=[...helperSource217.matchAll(/\{\n    "current": ("(?:[^"\\\n]|\\.)*"),\n    "historical": ""\n  \}/g)].map(match=>JSON.parse(match[1]));
assert217.equal(inserted217.length,2,'the helper records exactly two pure removals');
const pinnedBefore217=inserted217.reduce((text,block)=>{assert217.equal(text.split(block).length,2,'each inserted block occurs exactly once');return text.replace(block,'');},current217);
check217('exact current prefix is checked before any historical hash comparison',()=>{assert217.equal(hash217(current217),'078e1b3ae5d4ba1e79cc04cbc0c213ac544c479d6ba8645ac85abd7214c8d5f8');assert217.equal(Buffer.byteLength(current217),29851);
 assert217.equal(hash217(pinnedBefore217),'a885f7f5fed706ce783adc3cee9700e8c44d8190cdfea488491194ef33531635');assert217.equal(Buffer.byteLength(pinnedBefore217),29319);assert217.deepEqual(inserted217.map(block=>[Buffer.byteLength(block),block.split('\n').length-1]),[[169,1],[363,4]]);});
const historical217=historicalFrontendPrefix217(current217);
check217('the five reviewed inverse edits restore the unchanged historical authority as data',()=>{assert217.equal(hash217(historical217),'bd05ccad75ca07e71647d20b9169636ed1d73d33ee2bbb3a7c1e763a8121c1c5');assert217.equal(Buffer.byteLength(historical217),29077);assert217.equal(current217,original217);});
// From the prefix pinned before to the historical one, exactly three lines differ, at unchanged offsets (as before the
// two insertions). The five reviewed contexts are the two inserted blocks and those three lines.
const currentLines217=pinnedBefore217.split('\n'),historicalLines217=historical217.split('\n');
assert217.equal(currentLines217.length,historicalLines217.length);
const edits217=currentLines217.flatMap((line,index)=>line===historicalLines217[index]?[]:[line]);
assert217.equal(edits217.length,3);
const contexts217=[...inserted217,...edits217.map(line=>line+'\n')];
assert217.equal(contexts217.length,5);
// The approved dataset correction adds one exact current context; neither an old
// executable prefix nor an edited deletion clause is silently accepted.
const datasetCurrent218="    this.dataset = new Proxy({}, { set(t, k, v) { t[k] = String(v); el.attributes[\"data-\" + String(k).replace(/[A-Z]/g, (c) => \"-\" + c.toLowerCase())] = String(v); return true; }, get(t, k) { if (k in t) return t[k]; const a = el.attributes[\"data-\" + String(k).replace(/[A-Z]/g, (c) => \"-\" + c.toLowerCase())]; return a === undefined ? undefined : String(a); }, deleteProperty(t, k) { const deleted = Reflect.deleteProperty(t, k); if (deleted) delete el.attributes[\"data-\" + String(k).replace(/[A-Z]/g, (c) => \"-\" + c.toLowerCase())]; return deleted; } }); // data-* attributes, as a browser does (set through the proxy or as an attribute)\n";
const datasetPrevious218="    this.dataset = new Proxy({}, { set(t, k, v) { t[k] = String(v); el.attributes[\"data-\" + String(k).replace(/[A-Z]/g, (c) => \"-\" + c.toLowerCase())] = String(v); return true; }, get(t, k) { if (k in t) return t[k]; const a = el.attributes[\"data-\" + String(k).replace(/[A-Z]/g, (c) => \"-\" + c.toLowerCase())]; return a === undefined ? undefined : String(a); } }); // data-* attributes, as a browser does (set through the proxy or as an attribute)\n";
check217('the exact previous current prefix stays historical and cannot replace this current setup',()=>{
 assert217.equal(current217.split(datasetCurrent218).length,2);
 // The .218 predecessor (before the dataset correction), measured without the two blocks inserted on 14 Nov 2026.
 const previous=pinnedBefore217.replace(datasetCurrent218,datasetPrevious218);
 assert217.equal(Buffer.byteLength(previous),29127);
 assert217.equal(hash217(previous),'05fafa7e0989e6ef29d432c9b53d99dcc22b00ac14a9d25526a7852798f75a04');
 assert217.throws(()=>historicalFrontendPrefix217(previous),/prefix_context_not_unique/);
 // Neither the same predecessor line inside today's prefix, nor the prefix pinned before, is accepted as current.
 assert217.throws(()=>historicalFrontendPrefix217(current217.replace(datasetCurrent218,datasetPrevious218)),/prefix_context_not_unique/);
 assert217.throws(()=>historicalFrontendPrefix217(pinnedBefore217),/prefix_context_not_unique/);
});
check217('a byte edit inside the reviewed dataset deletion context is refused',()=>{
 const changed=current217.replace('if (deleted) delete el.attributes[','if (deleted) delete el.attribute[');
 assert217.notEqual(changed,current217);
 assert217.throws(()=>historicalFrontendPrefix217(changed),/prefix_context_not_unique/);
});
check217('historical executable input is refused',()=>assert217.throws(()=>historicalFrontendPrefix217(historical217),/prefix_context_not_unique/));
check217('each duplicate reviewed context is refused',()=>{for(const context of contexts217)assert217.throws(()=>historicalFrontendPrefix217(current217+context),/prefix_context_not_unique/);});
check217('each missing reviewed context is refused',()=>{for(const context of contexts217){assert217.equal(current217.split(context).length,2);assert217.throws(()=>historicalFrontendPrefix217(current217.replace(context,'')),/prefix_context_not_unique/);}});
check217('drift outside the five reviewed contexts is refused',()=>assert217.throws(()=>historicalFrontendPrefix217(current217.replace('const walk =','const walk  =')),/current_prefix_drift/));
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
const treasuryHistorical217=historicalTreasuryNativeFixture217(nativeSource217);
const treasuryEntryStart217=nativeSource217.indexOf(' {const f=fixture(),entryPage='),treasuryEntryEnd217=nativeSource217.indexOf("  check('real privacy OAuth requests identify only'",treasuryEntryStart217);
assert217.ok(treasuryEntryStart217>nativeCuts217[0].index&&treasuryEntryEnd217>treasuryEntryStart217);
const treasuryContexts217=[nativeLine217,nativeSource217.slice(treasuryEntryStart217,treasuryEntryEnd217)];
check217('Treasury whole current fixture maps to exact original authority only as data',()=>{assert217.equal(hash217(nativeSource217),'e0242a0b2640c3c2770d2a0605b5ce267728624b7bdddf1b54e38bc646f6747c');assert217.equal(hash217(treasuryHistorical217),'0f2fec9685d3a22ceb3f8684ec72d913a749d5ad33cb9b07bc62d9c96d87e98e');assert217.equal(Buffer.byteLength(treasuryHistorical217),38099);});
check217('Treasury each duplicate whole-fixture context is refused',()=>{for(const context of treasuryContexts217)assert217.throws(()=>historicalTreasuryNativeFixture217(nativeSource217+context),/native_context_not_unique/);});
check217('Treasury each missing whole-fixture context is refused',()=>{for(const context of treasuryContexts217)assert217.throws(()=>historicalTreasuryNativeFixture217(nativeSource217.replace(context,'')),/native_context_not_unique/);});
check217('Treasury unrelated compiled setup drift is refused',()=>assert217.throws(()=>historicalTreasuryNativeFixture217(nativeSource217.replace('function fixture(){','function fixture() {')),/native_current_fixture_drift/));
check217('Treasury drift after the compiled setup boundary is refused',()=>assert217.throws(()=>historicalTreasuryNativeFixture217(nativeSource217+'\n// unreviewed tail\n'),/native_current_fixture_drift/));
check217('Treasury historical executable input is refused',()=>assert217.throws(()=>historicalTreasuryNativeFixture217(treasuryHistorical217),/native_context_not_unique/));
check217('Treasury prefix alone is not whole-fixture authority',()=>assert217.throws(()=>historicalTreasuryNativeFixture217(nativeCurrent217),/native_context_not_unique/));
check217('Treasury wrong input type is refused',()=>assert217.throws(()=>historicalTreasuryNativeFixture217(Buffer.from(nativeSource217)),/native_fixture_type/));
console.log(`${checks217}/${checks217} current frontend prefix controls passed`);

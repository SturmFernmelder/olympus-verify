'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../../..'), assets = path.join(root, 'worker/public/static/army-live');
const parserScope = vm.createContext({TextEncoder});
vm.runInContext(fs.readFileSync(path.join(assets, 'sanitized-export.js'), 'utf8'), parserScope, {timeout:1000});
const parser = parserScope.OlympusSanitizedExport;
const NOW = 1792756800;
const fixture = () => ({schema:'olympus-site-aggregate',version:1,producer:'1.3.2-site.1',capturedAt:NOW,realmGroup:'Forever PvE',faction:'Alliance',guild:{name:'Olympus I',observedAt:NOW,characters:100,online:20}});
const lua = value => typeof value === 'object' ? '{'+Object.entries(value).map(([key,item])=>'['+JSON.stringify(key)+']='+lua(item)+',').join('')+'}' : JSON.stringify(value);
const text = value => 'OlympusSiteAggregate = '+lua(value)+'\n';
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('PASS '+name); }
const refuse = value => assert.throws(() => parser.parse(text(value), {nowSeconds:NOW}));
check('normalizes only one masked own guild with actual local producer and original times', () => {
  const v = parser.parse(text(fixture()), {nowSeconds:NOW});
  assert.equal(v.addonVersion, '1.3.2-site.1'); assert.equal(v.sourceVerified,false); assert.equal(v.membershipProof,false);
  assert.equal(v.observedAt,NOW); assert.equal(v.guilds[0].receivedAt,NOW); assert.equal(v.guilds[0].classes,null); assert.ok(Object.isFrozen(v.guilds[0]));
});
for (const [native,canonical] of [['OLYMPUS','Olympus'],['oLyMpUs iX','Olympus IX']]) check('canonicalizes exact ASCII guild '+native, () => {
  const v=fixture();v.guild.name=native;
  const out=parser.parse(text(v),{nowSeconds:NOW});
  assert.equal(out.guilds[0].name,canonical);
  assert.equal(out.guilds[0].receivedAt,NOW);
});
for (const name of [' Olympus','Olympus ','Olympus XI','Оlympus']) check('refuses noncanonical scope '+name, () => {
  const v=fixture();v.guild.name=name;refuse(v);
});
for (const key of ['chat','keys','privateKey','reporter','player','character','discordId','identity','OlympusDB','unknown']) check('refuses unknown root '+key, () => {const v=fixture();v[key]='sensitive';refuse(v);});
for (const key of ['names','members','playerGuid','notes','classes','linkedAlts','source','provenance']) check('refuses unknown guild '+key, () => {const v=fixture();v.guild[key]='sensitive';refuse(v);});
for (const attack of [
  'OlympusDB = {}', 'OlympusSiteAggregate = loadstring("return 1")()',
  'OlympusSiteAggregate = {} os.execute("command")', 'OlympusSiteAggregate = (function() return {} end)()',
  'OlympusSiteAggregate = { ["__proto__"] = {}, }', 'OlympusSiteAggregate = { ["constructor"] = {}, }',
  'OlympusSiteAggregate = { ["schema"]="a",["schema"]="b", }',
  'OlympusSiteAggregate = {schema="olympus-site-aggregate"}', 'OlympusSiteAggregate = nil',
  'OlympusSiteAggregate = { [1]={}, }', 'OlympusSiteAggregate = { ["a"]=1e3, }',
  'OlympusSiteAggregate = { ["a"]=-1, }', 'OlympusSiteAggregate = { ["a"]=0/0, }',
  'OlympusSiteAggregate = { ["a"]=[[long string]], }', 'OlympusSiteAggregate = {} -- extra comment',
  'OlympusSiteAggregate = {}\nOtherVariable = {}', '\ufeffOlympusSiteAggregate = {}'
]) check('closed grammar refuses attack '+(passed+1), () => assert.throws(()=>parser.parse(attack,{nowSeconds:NOW})));
for (const [field,value] of [['schema','other'],['version',2],['producer','0.2.0'],['capturedAt',NOW+1],['capturedAt',NOW-86401],['faction','Unknown']]) check('refuses altered '+field, () => {const v=fixture();v[field]=value;refuse(v);});
for (const [field,value] of [['name','Other Guild'],['name','Olympus Alt'],['observedAt',NOW+1],['observedAt',NOW-86401],['characters',4],['characters',1001],['online',3],['online',99],['online',101]]) check('refuses private/out-of-scope guild '+field+'='+value, () => {const v=fixture();v.guild[field]=value;refuse(v);});
check('raw unsafe count is refused even when old-online remasking would hide it', () => {const v=fixture();v.capturedAt=NOW-901;v.guild.observedAt=NOW-901;v.guild.online=3;refuse(v);});
check('small total requires unavailable online', () => {const v=fixture();v.guild.characters='few';v.guild.online='few';refuse(v);v.guild.online='unavailable';assert.equal(parser.parse(text(v),{nowSeconds:NOW}).guilds[0].online,null);});
check('withholds online after 900 seconds without renewing original source time', () => {const v=fixture();v.capturedAt=NOW-901;v.guild.observedAt=NOW-901;const out=parser.parse(text(v),{nowSeconds:NOW});assert.equal(out.guilds[0].online,null);assert.equal(out.observedAt,NOW-901);});
check('keeps the exact 900-second boundary then withholds at 901', () => {const v=fixture();v.capturedAt=NOW-900;v.guild.observedAt=NOW-900;assert.equal(parser.parse(text(v),{nowSeconds:NOW}).guilds[0].online,20);});
check('rejects overlong, deeply nested, control and escaped key material', () => {
  for(const input of [' '.repeat(8193),'OlympusSiteAggregate = '+('{["a"]='.repeat(5))+'0'+('}'.repeat(5)), 'OlympusSiteAggregate = {["x"]="\\000"}', 'OlympusSiteAggregate = {["x"]="'+('a'.repeat(97))+'"}']) assert.throws(()=>parser.parse(input,{nowSeconds:NOW}));
});
check('ordinary whitespace, trailing table commas and escaped printable strings are accepted', () => {assert.equal(parser.parse(text(fixture()).replace('Olympus I','Olympus\\032I'),{nowSeconds:NOW}).guilds[0].name,'Olympus I');});
check('all three unavailable distributions stay null and added proof is rejected', () => {const v=parser.parse(text(fixture()),{nowSeconds:NOW});for(const k of ['classes','levels','ranks'])assert.equal(v.guilds[0][k],null);assert.throws(()=>parser.validateSnapshot({...v,sourceVerified:true},NOW));});

class Element {
  constructor(){this.listeners={};this.children=[];this.textContent='';this.value='';this.disabled=false;this.hidden=false;this.checked=false;this.inert=false;this.attributes={};}
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);} removeEventListener(k,fn){this.listeners[k]=(this.listeners[k]||[]).filter(x=>x!==fn);} replaceChildren(...x){this.children=x;} append(...x){this.children.push(...x);}
  setAttribute(k,value){this.attributes[k]=String(value);}
  async fire(k,event={}){for(const fn of this.listeners[k]||[])await fn({preventDefault(){},...event});}
}
async function browser() {
  const ids=new Map(),events={},timers=[],calls=[]; let wall=NOW*1000,mono=0;
  for(const id of ['aggregate-file','aggregate-drop','aggregate-status','aggregate-review','aggregate-clear','report-status','report-preview','report-clear','report-preview-results','report-consent-area','report-consent','report-publish','report-outcome']) ids.set(id,new Element());
  const document={hidden:false,getElementById:id=>ids.get(id)||null,querySelector:s=>s.startsWith('#')?ids.get(s.slice(1))||null:null,addEventListener(k,fn){(events[k]??=[]).push(fn);},removeEventListener(k,fn){events[k]=(events[k]||[]).filter(x=>x!==fn);}};
  const scope={document,TextEncoder,TextDecoder,Uint8Array,AbortController,Response,Date:class extends Date{static now(){return wall;}},performance:{now:()=>mono},setInterval(fn){timers.push(fn);return 1;},setTimeout(){return 1;},clearTimeout(){},clearInterval(){},addEventListener(){},removeEventListener(){},OlympusGuildQRProtocol:{validatePayload(){throw Error('New producer must not pretend to be the legacy QR producer.');}},OlympusArmyCards:{card:value=>({textContent:JSON.stringify(value)})},fetch:async(url,init={})=>{calls.push({url,init});if(url==='/api/army/reporter')return new Response(JSON.stringify({format:'olympus-army-reporter-v1',canPublish:true,sanitizedExporterAvailable:true,now:NOW}));if(url==='/api/army/preview'){const value=JSON.parse(init.body);return new Response(JSON.stringify({format:'olympus-army-preview-v1',persisted:false,previewToken:'token',expiresAt:NOW+300,now:NOW,snapshot:value.snapshot}));}throw Error('Unexpected network action');}};
  scope.window=scope;vm.createContext(scope);
  for(const name of ['sanitized-export.js','report.js','savedvariables-import.js']){vm.runInContext(fs.readFileSync(path.join(assets,name),'utf8'),scope,{timeout:1000});if(name==='report.js')scope.OlympusArmyReport=scope.OlympusArmyReportTool.mount(document,{owner:document});if(name==='savedvariables-import.js')scope.OlympusArmyLocalImport=scope.OlympusArmyLocalImportTool.mount(document,{report:scope.OlympusArmyReport});}
  for(let n=0;n<8;n++)await new Promise(setImmediate);
  const input=ids.get('aggregate-file'),content=text(fixture());input.files=[{name:'OlympusSiteAggregate.lua',size:content.length,text:async()=>content}];await input.fire('change');
  assert.equal(calls.length,1,'file selection never sends a file or aggregate');assert.equal(ids.get('aggregate-review').children.length,1);assert.equal(ids.get('report-preview').disabled,false);
  await ids.get('report-preview').fire('click');assert.equal(calls.length,2);const sent=JSON.parse(calls[1].init.body);assert.equal(sent.snapshot.addonVersion,'1.3.2-site.1');assert.equal(sent.snapshot.realmGroup,'World of Warcraft: Forever PvE');assert.ok(!calls[1].init.body.includes('OlympusSiteAggregate'));assert.equal(ids.get('report-publish').disabled,true,'consent remains separate');
  mono+=300000;wall+=300000;for(const fn of timers)fn();assert.equal(ids.get('aggregate-review').children.length,0);assert.equal(ids.get('report-preview').disabled,true);assert.equal(calls.length,2);
  const raw={name:'Olympus.lua',size:42,text:async()=>{throw Error('Raw file must never be read');}};input.files=[raw];await input.fire('change');assert.equal(calls.length,2);assert.match(ids.get('aggregate-status').textContent,/Choose only/);
  console.log('PASS browser import stays local, exact preview requires action, consent and expiry remain separate');passed++;
}
browser().then(()=>console.log('RESULT '+passed+' passed; no provider or SQLite calls')).catch(error=>{console.error(error.stack);process.exitCode=1;});

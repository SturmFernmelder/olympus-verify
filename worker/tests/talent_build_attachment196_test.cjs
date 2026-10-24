// Actual browser serialization and server attachment validation over the same pinned source.
// Pure local computation: no SQLite/D1 runtime, Workerd, browser session, provider, network or account action.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto'), assert = require('node:assert/strict'), ts = require('typescript');
const worker = path.join(__dirname, '..'), repo = path.join(worker, '..'), folder = path.join(worker, 'public/static/talents');
const bytes = fs.readFileSync(path.join(folder, 'data.json')), data = JSON.parse(bytes);
const browser = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(folder, 'calculator.js'), 'utf8'), { module: browser }, { filename: 'calculator.js', timeout: 1000 });
const calculator = browser.exports, generator = require('../../scripts/build-talent-build-contract.cjs');
const cache = new Map();
function load(name) {
  name = name.replace(/^\.\//, '');
  if (!['talent-build-contract', 'talent-build-attachment'].includes(name)) throw Error('Unexpected dependency: ' + name);
  if (cache.has(name)) return cache.get(name).exports;
  const module = { exports: {} }; cache.set(name, module);
  const result = ts.transpileModule(fs.readFileSync(path.join(worker, 'src', name + '.ts'), 'utf8'), { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  assert.equal(result.diagnostics?.length ?? 0, 0);
  new Function('module', 'exports', 'require', result.outputText)(module, module.exports, load);
  return module.exports;
}
const contract = load('talent-build-contract'), { talentBuildAttachment: attachment, applicationTalentBuilds: collection, sharedApplicationTalentBuilds: shared, TALENT_BUILD_COLLECTION_LIMITS: collectionLimits } = load('talent-build-attachment');
let count = 0, parityCases = 0, networkCalls = 0;
globalThis.fetch = () => { networkCalls++; throw Error('No network in attachment checks'); };
const check = (name, run) => { run(); count++; console.log('PASS ' + name); };
const all = cls => cls.trees.flatMap(tree => tree.talents);
const wire = build => ['ot1', data.revision, build.className, build.level, build.ranks.join('')].join('.');
const clone = value => JSON.parse(JSON.stringify(value));
function sameAcceptance(build) {
  const code = wire(build), checked = calculator.validateBuild(data, build), result = attachment(code);
  assert.equal(result !== null, checked.ok, code);
  if (checked.ok) {
    assert.equal(calculator.serializeBuild(data, build), code);
    assert.deepEqual(result, { code, className: build.className, level: build.level, points: checked.points });
  }
  parityCases++;
}
check('generated contract reproduces exact source and known input hashes', () => {
  assert.equal(generator.buildContract(repo), fs.readFileSync(path.join(worker, 'src/talent-build-contract.ts'), 'utf8'));
  assert.equal(contract.TALENT_SNAPSHOT_DATA_SHA256, '8b174d764836675b2b759050f441e2dfe12c7bad6a5b279ef39b05d8b1288a0c');
  assert.equal(contract.TALENT_SNAPSHOT_DATA_SHA256, crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(contract.TALENT_SNAPSHOT_UPSTREAM_SHA256, data.source.rawSHA256);
  assert.equal(contract.TALENT_SERIALIZER_SOURCE_SHA256, crypto.createHash('sha256').update(fs.readFileSync(path.join(folder, 'calculator.js'))).digest('hex'));
  assert.ok(calculator.validateData(data).ok);
});
check('all nine generated class constraints are deeply frozen and match real talent topology', () => {
  assert.ok(Object.isFrozen(contract.TALENT_ATTACHMENT_CLASSES));
  assert.equal(Object.keys(contract.TALENT_ATTACHMENT_CLASSES).length, 9);
  for (const cls of data.classes) {
    const nodes = all(cls), rows = contract.TALENT_ATTACHMENT_CLASSES[cls.id];
    assert.ok(Object.isFrozen(rows)); assert.equal(rows.length, nodes.length);
    for (const [index, row] of rows.entries()) {
      const talent = nodes[index], tree = cls.trees.findIndex(t => t.talents.some(n => n.id === talent.id));
      assert.ok(Object.isFrozen(row)); assert.deepEqual(row.slice(0, 3), [talent.maxRank, talent.row, tree]);
      assert.equal(row[3], talent.requires ? nodes.findIndex(t => t.id === talent.requires) : -1);
    }
  }
});
check('generator refuses a changed revision, missing class, corrupt rank or unresolved prerequisite', () => {
  for (const mutate of [d => { d.revision = 'a'.repeat(12); }, d => { d.classes.pop(); }, d => { d.classes[0].trees[0].talents[0].maxRank++; }, d => { d.classes[0].trees[0].talents[0].requires = 'not-in-this-tree'; }]) {
    const changed = clone(data); mutate(changed); assert.throws(() => generator.projectSnapshot(changed, calculator), /talent_snapshot_contract/);
  }
});
check('optional absent or blank attachments clear only the saved build code', () => {
  for (const input of [undefined, null, '', '  \t\n']) assert.deepEqual(attachment(input), { code: '' });
});
for (const cls of data.classes) check(cls.name + ': every level10–60 and deterministic legal allocation round-trips unchanged', () => {
  for (let level = 10; level <= 60; level++) {
    let build = calculator.emptyBuild(data, cls.id, level); sameAcceptance(build);
    const first = cls.trees[0].talents.find(t => t.row === 1), next = calculator.allocate(data, build, first.id, 1);
    assert.ok(next.ok); sameAcceptance(next.build);
  }
  let build = calculator.emptyBuild(data, cls.id, 60), seed = 0x196 + data.classes.indexOf(cls);
  for (let step = 0; step < 180; step++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const target = all(cls)[seed % all(cls).length], next = calculator.allocate(data, build, target.id, seed & 8 ? 1 : -1);
    if (next.ok) build = next.build;
    sameAcceptance(build);
  }
});
const guideContext = {};
vm.runInNewContext(fs.readFileSync(path.join(folder, 'guide-builds179.js'), 'utf8'), guideContext, { filename: 'guide-builds179.js', timeout: 1000 });
const guides = guideContext.OlympusTalentGuides.records;
check('all fourteen real guide allocations retain the exact calculator serialization', () => {
  assert.equal(guides.length, 14);
  for (const record of guides) {
    const parsed = calculator.parseBuild(data, record.code); assert.ok(parsed.ok, record.id);
    assert.equal(calculator.serializeBuild(data, parsed.build), record.code);
    assert.equal(attachment(record.code).code, record.code); sameAcceptance(parsed.build);
  }
});
const valid = calculator.emptyBuild(data, 'warrior', 30), code = calculator.serializeBuild(data, valid);
check('revision, version, class, rank vector length and rank values are closed', () => {
  for (const bad of [code.replace(data.revision, 'f'.repeat(12)), code.replace('ot1.', 'ot2.'), code.replace('.warrior.', '.constructor.'), code.replace('.warrior.', '.deathknight.'), code.replace('.warrior.', '.Warrior.'), code.slice(0, -1), code + '0', code.replace(/0$/, '9'), code.replace(/0$/, '-1'), code.replace(/0$/, '１'), code + '.extra', code + '\nextra']) assert.equal(attachment(bad), null, bad);
});
check('level boundaries and point budgets match the actual calculator', () => {
  for (const level of [0, 9, 10, 11, 30, 60, 61, 69]) {
    const build = { ...valid, level }; sameAcceptance(build);
  }
  const full = guides.map(g => calculator.parseBuild(data, g.code)).find(p => p.ok && p.points === 51);
  assert.ok(full); sameAcceptance({ ...full.build, level: 30 }); assert.equal(attachment(wire({ ...full.build, level: 30 })), null);
});
check('earlier-row threshold is exact and same-row or other-tree points cannot fund it', () => {
  const cls = data.classes[0], nodes = all(cls), target = nodes.findIndex(t => t.row === 2 && !t.requires);
  const build = calculator.emptyBuild(data, cls.id, 60); let remaining = 5;
  for (const [index, talent] of nodes.entries()) if (cls.trees[0].talents.includes(talent) && talent.row === 1) { build.ranks[index] = Math.min(remaining, talent.maxRank); remaining -= build.ranks[index]; }
  assert.equal(remaining, 0); build.ranks[target] = 1; sameAcceptance(build); assert.ok(attachment(wire(build)));
  const lower = build.ranks.findIndex((rank, i) => rank && nodes[i].row === 1); build.ranks[lower]--; sameAcceptance(build); assert.equal(attachment(wire(build)), null);
  const otherTree = nodes.findIndex(t => cls.trees[1].talents.includes(t) && t.row === 1); build.ranks[otherTree] = 1; sameAcceptance(build); assert.equal(attachment(wire(build)), null);
  const sameRow = nodes.findIndex((t, i) => i !== target && cls.trees[0].talents.includes(t) && t.row === 2 && !t.requires); build.ranks[sameRow] = 1; sameAcceptance(build); assert.equal(attachment(wire(build)), null);
});
check('a prerequisite must be at maximum even when its earlier-row budget is satisfied', () => {
  const cls = data.classes[0], nodes = all(cls), target = nodes.findIndex(t => t.row === 3 && t.requires), prior = nodes.findIndex(t => t.id === nodes[target].requires);
  assert.ok(target >= 0 && prior >= 0);
  const build = calculator.emptyBuild(data, cls.id, 60); let remaining = 10;
  for (const [index, talent] of nodes.entries()) if (cls.trees[0].talents.includes(talent) && talent.row === 1) { build.ranks[index] = Math.min(remaining, talent.maxRank); remaining -= build.ranks[index]; }
  assert.equal(remaining, 0); build.ranks[target] = 1;
  assert.match(calculator.validateBuild(data, build).error, /requires/); sameAcceptance(build);
  build.ranks[prior] = nodes[prior].maxRank - 1; assert.equal(attachment(wire(build)), null); sameAcceptance(build);
  build.ranks[prior]++; sameAcceptance(build); assert.ok(attachment(wire(build)));
});
const url = 'https://olympus.roachcouncil.com/#/talents/warrior/' + code;
check('only canonical same-site share URLs are reduced to the identical code', () => {
  assert.deepEqual(attachment(url), attachment(code));
  assert.deepEqual(attachment(' \n' + url + '\t '), attachment(code));
  assert.deepEqual(attachment('https://guild.example/#/talents/warrior/' + code, 'guild.example'), attachment(code));
});
check('unsafe or URL-normalized aliases cannot attach a build', () => {
  for (const bad of [url.replace('https:', 'http:'), url.replace('https:', 'javascript:'), url.replace('https:', 'HTTPS:'), url.replace('olympus.roachcouncil.com', 'evil.example'), url.replace('olympus.roachcouncil.com', 'olympus.roachcouncil.com.evil.example'), url.replace('https://', 'https://person@'), url.replace('https://', 'https://person:secret@'), url.replace('.com/', '.com:443/'), url.replace('.com/', '.com:8443/'), url.replace('.com/', '.COM/'), url.replace('/#/', '/?query=1#/'), url.replace('/#/', '/index.html#/'), url.replace('/#/', '/a/../#/'), url.replace('/#/', '\\/#/'), url.replace('/warrior/', '/mage/'), url.replace('/warrior/', '/%77arrior/'), url.replace('/ot1.', '/%6ft1.'), url + '/', url + '?query=1', url + '#extra', '//' + url.slice(8), '<' + url + '>']) assert.equal(attachment(bad), null, bad);
});
check('a host argument cannot smuggle an origin, credential, path, fragment or URL normalization', () => {
  for (const host of ['https://olympus.roachcouncil.com', 'person@olympus.roachcouncil.com', 'olympus.roachcouncil.com/path', 'olympus.roachcouncil.com?x=1', 'olympus.roachcouncil.com#x', 'OLYMPUS.roachcouncil.com', 'olympus.roachcouncil.com:443', '', null, {}, 'x'.repeat(254)]) assert.equal(attachment(url, host), null);
});
check('non-string and oversized input is refused without invoking getters or making requests', () => {
  let invoked = 0; const object = { get code() { invoked++; return code; }, toString() { invoked++; return code; } };
  for (const input of [true, 1, [], object, { code }, 'x'.repeat(513)]) assert.equal(attachment(input), null);
  assert.equal(invoked, 0); assert.equal(networkCalls, 0);
});
// The production caller supplies the existing Forever character parser. The actual
// API leaf below separately exercises that real parser; this seam keeps these checks pure.
function collectionName(value) {
  if (typeof value !== 'string' || !/^\p{L}{2,12} \p{L}{2,12}$/u.test(value.trim())) return { error: 'name' };
  const name = value.trim().split(' ').map(part => part[0].toUpperCase() + part.slice(1).toLowerCase()).join(' ');
  return { name, key: name.toLowerCase() };
}
const collectionCode = (cls, level) => calculator.serializeBuild(data, calculator.emptyBuild(data, cls, level));
const collectionContext = { character: 'Mia One', className: 'warrior' };
const characterBuilds = (character, cls) => ({ character, class: cls, build30: collectionCode(cls, 30), build60: collectionCode(cls, 60) });
const collectionFixture = () => ({ version: 1, characters: [characterBuilds('Mia One', 'warrior'), characterBuilds('Mia Two', 'mage'), characterBuilds('Mia Three', 'druid')] });
check('collection limits are frozen at three declared characters, six builds and2048UTF8 bytes', () => {
  assert.ok(Object.isFrozen(collectionLimits)); assert.ok(Object.isFrozen(collectionLimits.levels));
  assert.deepEqual(collectionLimits, { version: 1, characters: 3, builds: 6, levels: [30,60], bytes: 2048 });
  const result=collection(collectionFixture(),collectionContext,collectionName);
  assert.deepEqual(result,collectionFixture());assert.ok(new TextEncoder().encode(JSON.stringify(result)).length<=2048);
});
check('collection accepts only exact30/60 class builds and canonical local URLs reduce to codes', () => {
  const input=collectionFixture();input.characters[1].build30='https://olympus.roachcouncil.com/#/talents/mage/'+input.characters[1].build30;
  assert.deepEqual(collection(input,collectionContext,collectionName),collectionFixture());
  for(const mutate of [v=>v.characters[0].build30=collectionCode('warrior',29),v=>v.characters[0].build30=collectionCode('warrior',60),v=>v.characters[1].build60=collectionCode('warrior',60),v=>v.characters[1].class='undecided',v=>v.characters[0].build60='https://evil.example/#/talents/warrior/'+v.characters[0].build60]){const v=collectionFixture();mutate(v);assert.equal(collection(v,collectionContext,collectionName),null);}
});
check('collection anchors primary character and class and refuses duplicate normalized names or extra characters', () => {
  for(const mutate of [v=>v.characters[0].character='Other Person',v=>v.characters[0].class='mage',v=>v.characters[1].character='mia one',v=>v.characters[2].character='not-a-name',v=>v.characters.push(characterBuilds('Mia Four','priest')),v=>v.characters[0].character='Mia One\n']){const v=collectionFixture();mutate(v);assert.equal(collection(v,collectionContext,collectionName),null);}
  assert.equal(collection(collectionFixture(),{...collectionContext,character:null},collectionName),null);
});
check('collection is a closed data envelope and never invokes unexpected property getters', () => {
  let invoked=0;const v=collectionFixture();Object.defineProperty(v.characters[1],'privateNote',{get(){invoked++;return'secret';},enumerable:true});
  assert.equal(collection(v,collectionContext,collectionName),null);assert.equal(invoked,0);
  for(const mutate of [x=>x.version=2,x=>x.privateNote='secret',x=>x.characters[0].discordId='123',x=>x.characters[0].build30='x'.repeat(513),x=>x.characters[0].build60=null,x=>{x.characters[0].build30='';x.characters[0].build60='';}]){const x=collectionFixture();mutate(x);assert.equal(collection(x,collectionContext,collectionName),null);}
});
check('omission preserves own collection privately while explicit null or empty collection clears it', () => {
  const previous=collectionFixture(),context={...collectionContext,previous};
  assert.deepEqual(collection(undefined,context,collectionName),previous);
  assert.deepEqual(collection(null,context,collectionName),{version:1,characters:[]});
  assert.deepEqual(collection({version:1,characters:[]},context,collectionName),{version:1,characters:[]});
  assert.deepEqual(collection(undefined,collectionContext,collectionName),{version:1,characters:[]});
});
check('old collection codes survive only exact original character class and30/60slot values', () => {
  const previous=collectionFixture();previous.characters[1].build30=previous.characters[1].build30.replace(data.revision,'f'.repeat(12));
  assert.deepEqual(collection(previous,{...collectionContext,previous},collectionName),previous);
  assert.equal(collection(previous,collectionContext,collectionName),null);
  for(const mutate of [v=>v.characters[1].character='Mia Four',v=>v.characters[1].class='priest',v=>v.characters[1].build30+='0',v=>v.characters[1].build30=v.characters[1].build30.replace('.30.','.60.'),v=>v.characters[1].build30='https://olympus.roachcouncil.com/#/talents/mage/'+v.characters[1].build30]){const v=clone(previous);mutate(v);assert.equal(collection(v,{...collectionContext,previous},collectionName),null);}
});
check('invalid current codes never enter the historical retention branch', () => {
  const previous=collectionFixture();previous.characters[0].build30=previous.characters[0].build30.slice(0,-1)+'9';
  assert.equal(collection(previous,{...collectionContext,previous},collectionName),null);
});
check('board collection is minimal and requires a separate exact boolean choice', () => {
  const v=collectionFixture();for(const choice of [undefined,false,null,1,'true'])assert.deepEqual(shared(v,choice,collectionContext,collectionName),[]);
  const publicBuilds=shared(v,true,collectionContext,collectionName);assert.equal(publicBuilds.length,6);
  assert.ok(publicBuilds.every(row=>Object.keys(row).sort().join('|')==='character|class|code|level'));
  assert.deepEqual(publicBuilds.map(row=>row.level),[30,60,30,60,30,60]);
});
check('board revalidation refuses historical or changed primary context even with injected previous metadata', () => {
  const v=collectionFixture();v.characters[1].build30=v.characters[1].build30.replace(data.revision,'f'.repeat(12));
  assert.deepEqual(shared(v,true,{...collectionContext,previous:v},collectionName),[]);
  assert.deepEqual(shared(collectionFixture(),true,{...collectionContext,className:'mage'},collectionName),[]);
  assert.equal(networkCalls,0);
});
console.log(`\n${count} focused attachment checks passed; ${parityCases} actual-calculator parity cases; network calls ${networkCalls}.`);

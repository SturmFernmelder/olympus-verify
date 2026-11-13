'use strict';
// Evergreen Stage 2 (12 Nov 2026), talents lane: CL2-087 (10 November data, archive), CL2-088 (calculator Attach),
// CL2-089 (preset titles) and CL2-090 (presets legal and consistent with the 2 November notes on their own guide page).
// Plain Node over the shipped files and the real calculator; no network, D1, Workerd or browser.
// TALENTS_TEST_ROOT=<checkout> runs the same checks against another checkout (read-only), for the fail-before receipt.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const ts = require(require.resolve('typescript', { paths: [path.join(__dirname, '..')] }));
const repo = path.resolve(process.env.TALENTS_TEST_ROOT || path.join(__dirname, '../..'));
const worker = path.join(repo, 'worker'), folder = path.join(worker, 'public/static/talents');
const read = (...p) => fs.readFileSync(path.join(...p)), readText = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const exists = p => fs.existsSync(p);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let passed = 0, failed = 0;
function check(name, run) {
  let ok = false, detail = '';
  try { const result = run(); ok = result === true; if (!ok) detail = typeof result === 'string' ? result : JSON.stringify(result); }
  catch (error) { detail = error.message; }
  if (ok) passed++; else failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' :: ' + String(detail).slice(0, 400)));
}
const calc = (() => { const m = { exports: {} }; vm.runInNewContext(readText(folder, 'calculator.js'), { module: m }, { filename: 'calculator.js', timeout: 2000 }); return m.exports; })();
const dataBytes = read(folder, 'data.json'), data = JSON.parse(dataBytes);
const provenance = JSON.parse(readText(folder, 'provenance.json'));
const guides = JSON.parse(readText(worker, 'public/static/guides218.json'));
const flat = (d, cls) => d.classes.find(c => c.id === cls).trees.flatMap((tree, ti) => tree.talents.map(t => ({ ...t, ti, tree: tree.name })));
const ARCHIVED = '260cf99b52db', CURRENT = '02e1e101d1a5';
const archiveDir = path.join(folder, 'archive', ARCHIVED);

// --- CL2-087: the current snapshot is the 10 November export and provenance counts match the shipped bytes.
check('data.json is the 10 November export (revision 02e1e101d1a5, client 1.60.1.70755)', () =>
  data.revision === CURRENT && data.source.upstreamGenerated === '2026-11-10' && data.source.clientBuilds.join() === '1.60.1.70755'
  && data.source.rawSHA256.startsWith(data.revision) && data.source.license === 'CC-BY-4.0' && data.source.url === 'https://talentsforever.com/data.json');
check('the calculator accepts the snapshot with its reviewed inventory', () => { const v = calc.validateData(data); return v.ok && v.talents === 467 && v.ranks === 1297 || JSON.stringify(v); });
check('provenance counts, bytes and hashes match data.json', () => {
  let talents = 0, ranks = 0, trees = 0;
  for (const c of data.classes) for (const t of c.trees) { trees++; for (const x of t.talents) { talents++; ranks += x.maxRank; } }
  const counts = { classes: data.classes.length, trees, talents, ranks };
  return JSON.stringify(provenance.counts) === JSON.stringify(counts) && JSON.stringify(data.counts) === JSON.stringify(counts)
    && provenance.normalizedBytes === dataBytes.length && provenance.normalizedSHA256 === sha(dataBytes)
    && provenance.source.rawSHA256 === data.source.rawSHA256 && provenance.source.upstreamGenerated === data.source.upstreamGenerated
    && JSON.stringify(provenance.source.limits) === JSON.stringify(data.source.limits) || JSON.stringify({ counts, p: provenance.counts });
});
check('provenance and data disclose the hotfix and development-notes limits', () =>
  data.source.limits.some(x => /hotfixes of 3, 4, 6 and 10 November 2026/.test(x)) && data.source.limits.some(x => /development notes of 2 November 2026/.test(x))
  && data.source.limits.some(x => /Legacy Talented/.test(x)) && data.source.limits.some(x => /Blizzard/.test(x)));
check('the licence file still names CC BY 4.0 and the source terms', () => /CC BY 4\.0/.test(readText(folder, 'LICENSE-DATA.txt')) && /talentsforever\.com\/terms/.test(readText(folder, 'LICENSE-DATA.txt')));

// --- CL2-087: the archive keeps old codes readable.
const archiveData = exists(path.join(archiveDir, 'data.json')) ? JSON.parse(readText(archiveDir, 'data.json')) : null;
const archiveArt = exists(path.join(archiveDir, 'art.json')) ? JSON.parse(readText(archiveDir, 'art.json')) : null;
check('the 16 October snapshot is kept as an archive with its own art map, both accepted by the calculator', () =>
  !!archiveData && archiveData.revision === ARCHIVED && calc.validateData(archiveData).ok && calc.validateArt(archiveData, archiveArt).ok);
check('the archive record in provenance pins the archived bytes', () => {
  const entry = (provenance.archive || []).find(a => a.revision === ARCHIVED), bytes = read(archiveDir, 'data.json');
  return !!entry && entry.normalizedSHA256 === sha(bytes) && entry.normalizedBytes === bytes.length && entry.normalizedSHA256 === '8b174d764836675b2b759050f441e2dfe12c7bad6a5b279ef39b05d8b1288a0c'
    && entry.data === '/static/talents/archive/260cf99b52db/data.json' && entry.label === '16 October beta data';
});
check('the calculator maps the archived revision to the shipped archive files and labels it', () =>
  calc.ARCHIVES && calc.ARCHIVES[ARCHIVED].data === '/static/talents/archive/260cf99b52db/data.json' && calc.ARCHIVES[ARCHIVED].art === '/static/talents/archive/260cf99b52db/art.json'
  && calc.REVIEWED[ARCHIVED].label === '16 October beta data' && !Object.hasOwn(calc.ARCHIVES, CURRENT));
const oldGuides = JSON.parse(readText(__dirname, 'fixtures/evergreen1112_old_presets.json'));
check('every 16 October preset code still decodes on the archive and is refused by the current data', () => {
  const bad = oldGuides.filter(p => !archiveData || !calc.parseBuild(archiveData, p.code).ok || calc.parseBuild(data, p.code).ok);
  return bad.length === 0 && oldGuides.length === 58 || bad.map(p => p.id).join(',');
});
check('app.js, the Discord replies and the calculator list the same archived revisions', () => {
  const app = readText(worker, 'public/static/app.js'), discord = readText(worker, 'src/guild-utilities219.ts');
  const appList = /TALENT_ARCHIVES218 = Object\.freeze\(\{ "([a-f0-9]{12})": "16 October beta data" \}\)/.exec(app), discordList = /ARCHIVED_TALENT_REVISIONS219:readonly string\[\]=\['([a-f0-9]{12})'\]/.exec(discord);
  return !!appList && !!discordList && appList[1] === ARCHIVED && discordList[1] === ARCHIVED && Object.keys(calc.ARCHIVES).join() === ARCHIVED;
});

// --- Art rule: reused official files only, no-art list for the rest.
const art = JSON.parse(readText(folder, 'art.json'));
check('art.json covers every current talent: an existing local icon file or the no-art list', () => {
  const v = calc.validateArt(data, art); if (!v.ok) return v.error;
  const missingFiles = Object.values(art.talentIcons).filter(url => !exists(path.join(worker, 'public', url)));
  return missingFiles.length === 0 && v.unavailable === art.talentIconsUnavailable.length && art.talentIconsUnavailable.every(id => !art.talentIcons[id]) || missingFiles.join(',');
});

// --- CL2-089/CL2-090: presets.
check('guides218.json pins the current revision and client build', () => guides.talentRevision === data.revision && guides.talentClientBuild === data.source.clientBuilds.join(', '));
check('all 58 presets decode legally on the 10 November data and spend their full budget', () => {
  const bad = [];
  for (const p of guides.presets) {
    const parsed = calc.parseBuild(data, p.code);
    if (!parsed.ok || parsed.build.className !== p.classId || parsed.build.level !== p.level || parsed.points !== p.level - 9 || parsed.points !== p.points
      || JSON.stringify(parsed.treePoints) !== JSON.stringify(p.treePoints)) bad.push(p.id + ':' + (parsed.error || parsed.points));
  }
  return guides.presets.length === 58 && bad.length === 0 || bad.join(' ');
});
check('no preset title starts with "Olympus starting point ·"', () => guides.presets.every(p => !/^Olympus starting point/.test(p.label)));
check('each spec lists only presets of its own class and spec, and every preset is reviewed for this data', () =>
  guides.classes.every(c => c.specs.every(s => s.presets.every(id => { const p = guides.presets.find(x => x.id === id); return p && p.classId === c.id && p.specId === s.id; })))
  && guides.presets.every(p => p.provenance.reviewedAt === '2026-11-12'));
check('preset notes carry no stale beta or recheck wording', () => {
  const stale = guides.presets.filter(p => p.why.some(w => /October beta|beta preset|Recheck these|still contains points|November 2 changes:/i.test(w)));
  return stale.length === 0 || stale.map(p => p.id).join(',');
});
check('guide talent-change counts equal the snapshot counts for every spec and class', () => {
  const bad = [];
  for (const c of guides.classes) {
    const source = data.classes.find(x => x.id === c.id), sum = { changed: 0, same: 0, moved: 0, new: 0, classicOnly: 0 };
    c.specs.forEach((s, i) => {
      const tree = source.trees[i], w = { changed: 0, same: 0, moved: 0, new: 0, classicOnly: tree.removedClassic.length };
      for (const t of tree.talents) w[t.classic.status]++;
      for (const k of Object.keys(sum)) sum[k] += w[k];
      if (tree.id !== s.id || JSON.stringify(w) !== JSON.stringify(s.whatChanged)) bad.push(c.id + '/' + s.id);
    });
    const row = guides.classSummary.find(x => x.id === c.id);
    if (Object.keys(sum).some(k => row[k] !== sum[k])) bad.push(c.id);
  }
  return bad.length === 0 || bad.join(',');
});

// --- CL2-090: the 2 November notes each guide page quotes (source 150) against the presets of that class.
// Each rule names the exact words it rests on; the test first proves those words are on the class's own guide page.
const NOTES = guides.sources.findIndex(s => s.url === 'https://us.forums.blizzard.com/en/wow/t/2360696/9');
const RULES = [
  ['warrior', 'Improved Tactical Mastery three points', { cap: ['Improved Tactical Mastery', 3] }],
  ['warrior', 'Bloodthrill two points', { cap: ['Bloodthrill', 2] }],
  ['warrior', 'Flurry has three ranks and no longer needs Death Wish', { cap: ['Flurry', 3], noRequirement: 'Flurry' }],
  ['warrior', 'Death Wish leads to Bloodthirst', { requires: ['Bloodthirst', 'Death Wish'] }],
  ['paladin', 'loses Improved Seal of Fury and One-Handed Weapon Specialization', { removed: ['Improved Seal of Fury', 'One-Handed Weapon Specialization'] }],
  ['paladin', 'loses Instrument of Law', { removed: ['Instrument of Law'] }],
  ['paladin', 'replaces the old Twist of Light capstone with Unsealed Wrath', { removed: ['Twist of Light'], requires: ['Unsealed Wrath', 'Repentance'] }],
  ['paladin', 'Spiritual Focus has five points on row 1. Reverence has two points on row 2.', { cap: ['Reverence', 2], max: ['Spiritual Focus', 5], row: [['Spiritual Focus', 1], ['Reverence', 2]] }],
  ['paladin', 'Divine Precision grants 4% or 8% hit', { cap: ['Divine Precision', 2] }],
  ['paladin', 'Conviction adds 2%, 4% or 6% crit', { cap: ['Conviction', 3] }],
  ['paladin', 'Two points give 15% or 30% more shield block value', { cap: ['Shield Specialization', 2] }],
  ['paladin', 'Vengeance now needs Seal of Command', { requires: ['Vengeance', 'Seal of Command'] }],
  ['rogue', 'Assassination loses Murder', { removed: ['Murder'] }],
  ['rogue', 'Relentless Strikes takes five points, Lethality two, and Seal Fate three', { max: ['Relentless Strikes', 5], cap: ['Lethality', 2], cap2: ['Seal Fate', 3] }],
  ['rogue', 'Dual Wield Specialization gives 25% or 50% off-hand damage over two ranks', { cap: ['Dual Wield Specialization', 2] }],
  ['rogue', 'Subtlety loses Improved Distract, Quietus, Cutthroat and Thousand Cuts', { removed: ['Improved Distract', 'Quietus', 'Cutthroat', 'Thousand Cuts'] }],
  ['rogue', 'Death Mark is the row-7 finisher', { row: [['Death Mark', 7]] }],
  ['priest', 'Blizzard replaced Binding Heal with Holy Binding', { removed: ['Binding Heal'], present: ['Holy Binding'] }],
  ['shaman', 'Call of Thunder replaces Lava Burst', { removed: ['Lava Burst'], present: ['Call of Thunder'] }],
  ['shaman', 'Elemental Mastery is now Lightning Mastery', { removed: ['Elemental Mastery'], present: ['Lightning Mastery'] }],
  ['mage', 'Blizzard removed Arcane Focus, Frost Blast and Piercing Ice', { removed: ['Arcane Focus', 'Frost Blast', 'Piercing Ice'] }],
  ['mage', 'Precision in the Frost tree now improves hit with all spells by 2%, 4% or 6%', { cap: ['Precision', 3] }],
  ['mage', 'Critical Mass now caps at three points', { cap: ['Critical Mass', 3] }],
  ['mage', 'Five points in Incineration', { max: ['Incineration', 5] }],
  ['mage', 'Missile Barrage moved to row 2', { row: [['Missile Barrage', 2]] }],
  ['druid', 'Berserk and Gift of the Earthmother were removed', { removed: ['Berserk', 'Gift of the Earthmother'] }],
  ['druid', 'Furor moves to Feral in exchange for Heart of the Wild, and Restoration gains Bloom', { tree: [['Furor', 'Feral Combat'], ['Heart of the Wild', 'Restoration'], ['Bloom', 'Restoration']] }],
  ['druid', 'Lacerate is a one-point Feral talent on row 4', { max: ['Lacerate', 1], row: [['Lacerate', 4]] }],
  ['druid', 'Predatory Discipline leads to Shifting Power', { requires: ['Shifting Power', 'Predatory Discipline'] }],
];
function quotedOnPage(cls) {
  const out = [];
  const walk = value => { if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') { if (Array.isArray(value.sources) && value.sources.includes(NOTES)) out.push(value.text || value.value || ''); Object.values(value).forEach(walk); } };
  walk(guides.classes.find(c => c.id === cls));
  return out.join('\n');
}
check('every rule quotes words that the class guide page attributes to the 2 November notes', () => {
  const missing = RULES.filter(([cls, quote]) => !quotedOnPage(cls).includes(quote));
  return NOTES >= 0 && missing.length === 0 || missing.map(r => r[0] + ': ' + r[1]).join(' | ');
});
check('the 10 November data agrees with every quoted 2 November note', () => {
  const bad = [];
  for (const [cls, quote, rule] of RULES) {
    const talents = flat(data, cls), byName = name => talents.find(t => t.name === name);
    for (const name of rule.removed || []) if (byName(name)) bad.push(cls + ' still has ' + name);
    for (const name of rule.present || []) if (!byName(name)) bad.push(cls + ' lacks ' + name);
    for (const [name, n] of [rule.cap, rule.cap2, rule.max].filter(Boolean)) if (!byName(name) || byName(name).maxRank !== n) bad.push(cls + ' ' + name + ' ranks ' + (byName(name) || {}).maxRank);
    for (const [name, row] of rule.row || []) if (!byName(name) || byName(name).row !== row) bad.push(cls + ' ' + name + ' row');
    for (const [name, tree] of rule.tree || []) if (!byName(name) || byName(name).tree !== tree) bad.push(cls + ' ' + name + ' tree');
    if (rule.requires) { const [child, parent] = rule.requires; if (!byName(child) || byName(child).requires !== (byName(parent) || {}).id) bad.push(cls + ' ' + child + ' requirement'); }
    if (rule.noRequirement && (!byName(rule.noRequirement) || byName(rule.noRequirement).requires)) bad.push(cls + ' ' + rule.noRequirement + ' still has a requirement');
  }
  return bad.length === 0 || bad.join(' | ');
});
check('no preset contradicts a quoted 2 November note on its own guide page', () => {
  const bad = [];
  for (const p of guides.presets) {
    const parsed = calc.parseBuild(data, p.code); if (!parsed.ok) { bad.push(p.id + ' undecodable'); continue; }
    const talents = flat(data, p.classId), rankOf = name => { const i = talents.findIndex(t => t.name === name); return i < 0 ? 0 : parsed.build.ranks[i]; };
    for (const [cls, , rule] of RULES) {
      if (cls !== p.classId) continue;
      for (const [name, cap] of [rule.cap, rule.cap2].filter(Boolean)) if (rankOf(name) > cap) bad.push(p.id + ' ' + name);
      if (rule.requires && rankOf(rule.requires[0]) && !rankOf(rule.requires[1])) bad.push(p.id + ' ' + rule.requires[0] + ' without ' + rule.requires[1]);
      // A removed talent may be named only to say it is gone; it can never be recommended.
      for (const name of rule.removed || []) for (const line of p.why) for (const sentence of line.split(/(?<=\.)\s+/)) {
        if (sentence.includes(name) && !/removed|gone|replaced|no longer|became|formerly|renamed|is now/i.test(sentence)) bad.push(p.id + ' recommends ' + name);
      }
    }
  }
  return bad.length === 0 || bad.join(' | ');
});
check('the preset whose intent no longer fits says so in its note', () => {
  const p = guides.presets.find(x => x.id === 'rogue-assassination-leveling-30');
  return !!p && p.why.some(w => /no longer fits a level-30 build/.test(w)) && !/Mutilate/.test(p.label);
});

// --- Everything else that reads the snapshot.
check('guide-builds179.js offers only unchanged, legal publisher allocations for the current revision', () => {
  const ctx = { window: {} }; vm.runInNewContext(readText(folder, 'guide-builds179.js'), ctx); const g = ctx.window.OlympusTalentGuides;
  const bad = g.records.filter(r => { const parsed = calc.parseBuild(data, r.code); return !parsed.ok || parsed.points !== r.points || JSON.stringify(parsed.treePoints) !== JSON.stringify(r.treePoints); });
  const totals = g.sources.every(s => s.accepted === g.records.filter(r => r.className === s.className).length);
  return g.revision === data.revision && bad.length === 0 && totals || JSON.stringify({ revision: g.revision, bad: bad.map(r => r.id) });
});
check('the level-60 sheet files are pinned to the current data and reference only current talents', () => {
  const naked = JSON.parse(readText(folder, 'naked60-186.json')), effects = JSON.parse(readText(folder, 'stat-effects186.json'));
  const ids = new Set(data.classes.flatMap(c => c.trees.flatMap(t => t.talents.map(x => x.id))));
  const stray = effects.components.filter(c => !ids.has(c.talentId)).map(c => c.id);
  return naked.build.talentRevision === data.revision && naked.dataJsonSHA256 === sha(dataBytes) && effects.source.talentRevision === data.revision
    && effects.source.dataJsonSHA256 === sha(dataBytes) && effects.counts.components === effects.components.length && stray.length === 0 || stray.join(',');
});
check('the build comparison module is pinned to the current data', () => {
  const ctx = { module: { exports: {} }, TextEncoder }; vm.runInNewContext(readText(folder, 'analysis.js'), ctx);
  const src = /const SOURCE = Object\.freeze\(\{ revision: "([a-f0-9]{12})", rawSHA256: "([a-f0-9]{64})", normalizedSHA256: "([a-f0-9]{64})"/.exec(readText(folder, 'analysis.js'));
  return !!src && src[1] === data.revision && src[2] === data.source.rawSHA256 && src[3] === sha(dataBytes);
});

// --- Worker contract and Discord replies (TypeScript transpiled in memory, as talent_build_attachment196_test does).
const cache = new Map();
function load(name) {
  name = name.replace(/^\.\//, '');
  if (!['talent-build-contract', 'talent-build-attachment'].includes(name)) throw Error('Unexpected dependency: ' + name);
  if (cache.has(name)) return cache.get(name).exports;
  const module = { exports: {} }; cache.set(name, module);
  const out = ts.transpileModule(readText(worker, 'src', name + '.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  new Function('module', 'exports', 'require', out.outputText)(module, module.exports, load);
  return module.exports;
}
check('the generated Worker contract is current, regenerates byte for byte and pins the current revision', () => {
  const generator = require(path.join(repo, 'scripts/build-talent-build-contract.cjs')), contract = load('talent-build-contract');
  return generator.buildContract(repo) === readText(worker, 'src/talent-build-contract.ts') && contract.TALENT_SNAPSHOT_REVISION === data.revision
    && contract.TALENT_SNAPSHOT_DATA_SHA256 === sha(dataBytes) && contract.TALENT_SNAPSHOT_UPSTREAM_SHA256 === data.source.rawSHA256;
});
check('the Worker accepts every preset for attachment and keeps an unchanged 16 October code only as history', () => {
  const { talentBuildAttachment, unchangedHistoricalTalentBuild } = load('talent-build-attachment');
  const refused = guides.presets.filter(p => { const r = talentBuildAttachment(p.code); return !r || r.code !== p.code || r.points !== p.points; });
  const old = oldGuides[0];
  return refused.length === 0 && talentBuildAttachment(old.code) === null && unchangedHistoricalTalentBuild(old.code, old.code, old.classId, old.level) === old.code || refused.map(p => p.id).join(',');
});
check('the Discord talent replies name the 10 November data, not the 16 October snapshot', () => {
  const source = readText(worker, 'src/guild-utilities219.ts');
  return !/16 October beta talent snapshot|'16 October beta builds'/.test(source) && /encoded against the 10 November talent data/.test(source) && /made on the 16 October beta data/.test(source);
});

// --- CL2-088: the calculator's own Attach control uses the guide presets' attachment path.
check('the calculator offers Attach only for level 30/60, hands over the exact code and is absent from archived builds', () => {
  const source = readText(folder, 'calculator.js'), app = readText(worker, 'public/static/app.js');
  return /const attachAvailable = !readOnly\(\) && typeof options\.onAttach === "function"/.test(source)
    && /attach\.hidden = !levelOk/.test(source) && /options\.onAttach\(Object\.freeze\(\{ classId: cls\.id, level: build\.level, code: serializeBuild\(data, build\), label: "Calculator build" \}\)\)/.test(source)
    && /canAttach: talentAttachAllowed218\(\), attachReason: TALENT_ATTACH_CLOSED218, onAttach: attachTalentBuild218,\n\s+onBuildChange/.test(app)
    && (app.match(/onAttach: attachTalentBuild218/g) || []).length === 2;
});

console.log(passed + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;

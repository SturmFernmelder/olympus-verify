'use strict';
// .186 level-60 sheet: pure data, formula and DOM checks. No SQLite, provider, network, game runtime or production state.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), folder = path.join(root, 'public/static/talents');
const dataBytes = fs.readFileSync(path.join(folder, 'data.json')), data = JSON.parse(dataBytes);
const nakedBytes = fs.readFileSync(path.join(folder, 'naked60-186.json')), naked = JSON.parse(nakedBytes);
const effectsBytes = fs.readFileSync(path.join(folder, 'stat-effects186.json')), effects = JSON.parse(effectsBytes);
const source = fs.readFileSync(path.join(folder, 'stats60.js'), 'utf8'), calculatorSource = fs.readFileSync(path.join(folder, 'calculator.js'), 'utf8');
const css = fs.readFileSync(path.join(folder, 'calculator.css'), 'utf8'), appSource = fs.readFileSync(path.join(root, 'public/static/app.js'), 'utf8');
function loadScript(name) { const m = { exports: {} }; vm.runInThisContext('(function(module,exports){' + fs.readFileSync(path.join(folder, name), 'utf8') + '\n})', { filename: name })(m, m.exports); return m.exports; }
const S = loadScript('stats60.js'), C = loadScript('calculator.js');
const guideContext = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(folder, 'guide-builds179.js'), 'utf8'), guideContext, { filename: 'guide-builds179.js', timeout: 1000 });
const guideData = guideContext.window.OlympusTalentGuides;
const H = value => crypto.createHash('sha256').update(value).digest('hex'), clone = value => JSON.parse(JSON.stringify(value));
const SVG_NS = 'http://www.w3.org/2000/svg';
let passed = 0, failed = 0, registered = 0, finished = false;
const pending = [];
// Fail closed: only the final handler clears the exit code, so an asynchronous check that never settles cannot pass silently.
process.exitCode = 1;
process.on('exit', () => { if (!finished) console.error('FAIL ' + (registered - passed - failed) + ' asynchronous check(s) never settled; no summary was reached'); });
function check(name, fn) {
  registered++;
  try { const out = fn(); if (out && typeof out.then === 'function') { pending.push(out.then(() => { passed++; console.log('PASS ' + name); }, error => { failed++; console.error('FAIL ' + name + ': ' + (error && error.stack || error)); })); return; } passed++; console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + ': ' + (error && error.stack || error)); }
}
// Independent Classic fixture (CMaNGOS mangos-classic 7f98ba0f sql/base/mangos.sql level-60 rows: Str, Agi, Sta, Int, Spi, line),
// transcribed from the verified research text, not from the generated files.
const CLASSIC60 = {'human-warrior': [120, 80, 110, 30, 47, 5592], 'human-paladin': [105, 65, 100, 70, 78, 5652], 'human-rogue': [80, 130, 75, 35, 52, 5712], 'human-priest': [35, 40, 50, 120, 131, 5772], 'human-mage': [30, 35, 45, 125, 126, 5832], 'human-warlock': [45, 50, 65, 110, 120, 5892], 'orc-warrior': [123, 77, 112, 27, 48, 5952], 'orc-hunter': [58, 122, 92, 62, 73, 6012], 'orc-rogue': [83, 127, 77, 32, 53, 6072], 'orc-shaman': [88, 52, 97, 87, 103, 6132], 'orc-warlock': [48, 47, 66, 107, 118, 6192], 'dwarf-warrior': [122, 76, 113, 29, 44, 6252], 'dwarf-paladin': [107, 61, 103, 69, 74, 6312], 'dwarf-hunter': [57, 121, 93, 64, 69, 6372], 'dwarf-rogue': [82, 126, 78, 34, 49, 6432], 'dwarf-priest': [37, 36, 53, 119, 124, 6492], 'night-elf-warrior': [117, 85, 109, 30, 45, 6552], 'night-elf-hunter': [52, 130, 89, 65, 70, 6612], 'night-elf-rogue': [77, 135, 74, 35, 50, 6672], 'night-elf-priest': [32, 45, 49, 120, 125, 6732], 'night-elf-druid': [62, 65, 69, 100, 110, 6792], 'undead-warrior': [119, 78, 111, 28, 50, 6852], 'undead-rogue': [79, 128, 76, 33, 55, 6912], 'undead-priest': [34, 38, 51, 118, 130, 6972], 'undead-mage': [29, 33, 46, 123, 125, 7032], 'undead-warlock': [44, 48, 66, 108, 120, 7092], 'tauren-warrior': [125, 75, 112, 25, 47, 7152], 'tauren-hunter': [60, 120, 92, 60, 72, 7212], 'tauren-shaman': [90, 50, 97, 85, 102, 7272], 'tauren-druid': [70, 55, 72, 95, 112, 7332], 'gnome-warrior': [115, 83, 109, 35, 45, 7392], 'gnome-rogue': [75, 133, 74, 40, 50, 7452], 'gnome-mage': [25, 38, 44, 133, 120, 7512], 'gnome-warlock': [40, 53, 64, 119, 115, 7572], 'troll-warrior': [121, 82, 111, 26, 46, 7632], 'troll-hunter': [56, 127, 91, 61, 71, 7692], 'troll-rogue': [81, 132, 76, 31, 51, 7752], 'troll-priest': [36, 42, 51, 116, 126, 7812], 'troll-shaman': [86, 57, 96, 86, 101, 7872], 'troll-mage': [31, 37, 46, 121, 121, 7932]};
// Class base health / base mana at level 60 and their mangos.sql lines.
const CLASSIC60_BASE = {warrior: [1689, 0, 5025], paladin: [1381, 1512, 5085], hunter: [1467, 1720, 5145], rogue: [1523, 0, 5205], priest: [1387, 1436, 5265], shaman: [1280, 1520, 5325], mage: [1360, 1273, 5385], warlock: [1414, 1373, 5445], druid: [1483, 1244, 5505]};
const talentsOf = cls => data.classes.find(c => c.id === cls).trees.flatMap(t => t.talents);
function ranksFor(cls, pairs = []) { const all = talentsOf(cls), ranks = all.map(() => 0); for (const [id, rank] of pairs) { const at = all.findIndex(t => t.id === id); assert.ok(at >= 0, id); ranks[at] = rank; } return ranks; }
function legalBuild(cls, wanted) {
  // Allocate the wanted ranks through the real point engine so every build used here is legal.
  let build = C.emptyBuild(data, cls, 60); const all = talentsOf(cls);
  for (const [id, rank] of wanted) {
    const target = all.find(t => t.id === id), tree = data.classes.find(c => c.id === cls).trees.find(t => t.talents.includes(target));
    for (let tries = 0; tries < 300 && build.ranks[all.indexOf(target)] < rank; tries++) {
      const step = C.allocate(data, build, id, 1); if (step.ok) { build = step.build; continue; }
      const filler = tree.talents.filter(t => t.row < target.row || t.id === target.requires).map(t => C.allocate(data, build, t.id, 1)).find(r => r.ok);
      assert.ok(filler, 'cannot reach ' + id); build = filler.build;
    }
    assert.equal(build.ranks[all.indexOf(target)], rank, id);
  }
  return build;
}
const model = S.prepare(data, naked, effects);
const row = (result, id) => result.rows.find(r => r.id === id);
const close = (a, b, eps = 0.006) => Math.abs(a - b) <= eps;
const evaluate = (cls, race, pairs, toggles) => S.evaluate(model, { className: cls, race, ranks: ranksFor(cls, pairs), toggles });

console.log('== .186 data validation ==');
check('SHA-256 helper agrees with Node crypto, including multi-byte text', () => { for (const text of ['', 'abc', 'A'.repeat(1000), 'Olympus 🛡️ — Intellect +10%']) assert.equal(S.sha256(text), H(text)); });
check('both files bind the exact shipped data.json bytes and talent revision', () => {
  assert.equal(H(dataBytes), naked.dataJsonSHA256); assert.equal(H(dataBytes), effects.source.dataJsonSHA256);
  assert.equal(naked.build.talentRevision, data.revision); assert.equal(effects.source.talentRevision, data.revision);
  assert.equal(naked.generatedAt, effects.source.generatedAt);
});
check('schemas and closed counts: 141 components (A63 B34 C10 M34; grades A135 B6), 56 combos (E40 D6 U10), 9 classes, 10 races, 21 formulas', () => {
  assert.equal(effects.schema, 'olympus-talent-stat-effects-v1'); assert.equal(naked.schema, 'olympus-naked60-v1');
  assert.equal(effects.components.length, 141); assert.deepEqual(effects.counts.byTier, { A: 63, B: 34, C: 10, M: 34 }); assert.deepEqual(effects.counts.byGrade, { A: 135, B: 6 });
  const tiers = {}, grades = {}; for (const c of effects.components) { tiers[c.tier] = (tiers[c.tier] || 0) + 1; grades[c.grade] = (grades[c.grade] || 0) + 1; }
  assert.deepEqual(tiers, { A: 63, B: 34, C: 10, M: 34 }); assert.deepEqual(grades, { A: 135, B: 6 });
  assert.deepEqual(effects.components.filter(c => c.added).map(c => c.id).sort(), ['hunter-marksmanship-careful-aim#ranged_attack_power_from_intellect', 'priest-shadow-spirit-tap#mana_regen_while_casting']);
  const byGrade = {}; for (const c of naked.combos) byGrade[c.baseStats.grade] = (byGrade[c.baseStats.grade] || 0) + 1;
  assert.deepEqual(byGrade, { E: 40, D: 6, U: 10 }); assert.equal(Object.keys(naked.classes).length, 9); assert.equal(Object.keys(naked.races).length, 10); assert.equal(naked.formulas.length, 21);
  assert.ok(S.validateNaked(data, naked).ok); assert.ok(S.validateEffects(data, effects).ok);
});
check('every component is bound to its exact data.json rank texts by SHA-256 (independent hash) and none is withheld', () => {
  for (const c of effects.components) { const talent = talentsOf(c.cls).find(t => t.id === c.talentId); assert.ok(talent, c.id); assert.equal(talent.maxRank, c.values.length, c.id); assert.deepEqual(c.textSHA256, talent.descriptions.map(H), c.id); }
  assert.equal(model.components.filter(c => !c.verified).length, 0);
});
check('valid race/class pairs match the talent data race lists and the class lists of every race', () => {
  for (const combo of naked.combos) assert.ok(naked.races[combo.race].classes.includes(combo.class), combo.id);
  assert.equal(Object.values(naked.races).reduce((s, r) => s + r.classes.length, 0), 56);
  assert.deepEqual(S.combosFor(model, 'paladin').map(c => c.race), ['human', 'dwarf', 'undead']);
  assert.deepEqual(S.combosFor(model, 'druid').map(c => c.race), ['night-elf', 'tauren', 'skyborne-high-order', 'skyborne-windshaper']);
});
check('Unavailable carries no number anywhere and the ten Skyborne combos carry no numbers at all', () => {
  const problems = [], walk = (value, at) => { if (!value || typeof value !== 'object') return; if (!Array.isArray(value) && value.grade === 'U' && 'value' in value && value.value !== null) problems.push(at); for (const [k, v] of Object.entries(value)) walk(v, at + '/' + k); };
  walk(naked, ''); assert.deepEqual(problems, []);
  const sky = naked.combos.filter(c => c.race.startsWith('skyborne'));
  assert.equal(sky.length, 10);
  for (const c of sky) { assert.equal(c.baseStats.grade, 'U'); assert.ok(Object.values(c.baseStats.values).every(v => v === null)); assert.equal(c.referenceSheet, null); assert.equal(c.measured, null); }
  assert.ok(naked.combos.every(c => c.measured === null));
});
check('grades are closed: combos E/D/U with the exact Classic label, components A/B, racial components B', () => {
  for (const c of naked.combos) { assert.ok(['E', 'D', 'U'].includes(c.baseStats.grade)); if (c.baseStats.grade === 'E') assert.equal(c.baseStats.label, 'Classic reference — not Forever-verified'); }
  assert.equal(naked.grades.E.label, 'Classic reference — not Forever-verified'); assert.equal(naked.grades.U.render, 'Unavailable');
  assert.ok(effects.components.every(c => ['A', 'B'].includes(c.grade) && ['A', 'B', 'C', 'M'].includes(c.tier)));
  for (const race of Object.values(naked.races)) for (const r of race.racials) for (const comp of r.components) assert.equal(comp.grade, 'B');
});
check('no HolyMinMax 1.60.1.70009 build is a data source; DB2 sources are 70425/70450 (plus the Classic Era comparison)', () => {
  const builds = new Set(naked.sources.find(s => s.id === 'db2-wago').files.map(f => f.build));
  assert.deepEqual([...builds].sort(), ['1.15.9.70003', '1.60.1.70425', '1.60.1.70450']);
  assert.ok(effects.source.db2Files.every(f => ['1.60.1.70425', '1.60.1.70450'].includes(f.build)));
  assert.ok(effects.components.every(c => !c.db2 || ['1.60.1.70425', '1.60.1.70450'].includes(c.db2.build)));
  assert.match(naked.evaluation.excluded, /70009/);
});
check('disputed formulas carry candidates and no chosen value (Druid AP level term, ranged AP per Agility, spell crit per Intellect)', () => {
  const druid = naked.classes.druid.apLevelCoefficient; assert.equal(druid.value, null); assert.deepEqual(druid.candidates.map(c => c.value).sort(), [0, 3]);
  for (const id of ['warrior', 'rogue']) { const r = naked.classes[id].rapPerAgility; assert.equal(r.value, null); assert.ok(r.candidates.some(c => c.value === 2) && r.candidates.some(c => c.value === 1)); }
  for (const id of ['paladin', 'priest', 'shaman', 'mage', 'warlock', 'druid']) { const s = naked.classes[id].spellCritFromIntellect; assert.equal(s.value, null); assert.equal(s.candidates.length, 2); }
  assert.equal(naked.formulas.find(f => f.id === 'mana_regen_spirit').status, 'approximate');
});
check('naked rules are in the data: Toughness needs gear, Earth Fury has the mace row, Ruthless has none', () => {
  assert.equal(effects.components.find(c => c.id === 'paladin-protection-toughness#item_armor_pct').appliesNaked, false);
  const earth = naked.races.dwarf.racials.find(r => r.spellId === 1259719); assert.equal(earth.appliesNaked, false); assert.equal(earth.equipRequirement.subclassMask, 48); assert.match(earth.equipRequirement.source, /255482/);
  assert.equal(naked.races.human.racials.find(r => r.name === 'Ruthless').equipRequirement, null);
});
check('validators fail closed on tampered copies', () => {
  const mutations = [
    [n => { n.combos.find(c => c.race.startsWith('skyborne')).baseStats.values.str = 50; }, 'naked'],
    [n => { n.classes.paladin.baseHealth.grade = 'U'; }, 'naked'],
    [n => { n.build.talentRevision = '000000000000'; }, 'naked'],
    [n => { n.combos.pop(); }, 'naked'],
    [n => { n.combos[0].measured = { maxHealth: 1 }; }, 'naked'],
    [n => { delete n.combos.find(c => c.baseStats.grade === 'D').baseStats.tolerance; }, 'naked'],
    [n => { n.classes.druid.apLevelCoefficient.candidates[0].predatoryStrikes = 'maybe'; }, 'naked'],
    [n => { n.classes.druid.formEffects[0].form = 'tree'; }, 'naked'],
    [e => { e.source.talentRevision = '000000000000'; }, 'effects'],
    [e => { e.components.pop(); }, 'effects'],
    [e => { e.components[0].values.push(9); }, 'effects'],
    [e => { e.components[0].tier = 'Z'; }, 'effects']
  ];
  for (const [mutate, kind] of mutations) {
    const copy = clone(kind === 'naked' ? naked : effects); mutate(copy);
    const verdict = kind === 'naked' ? S.validateNaked(data, copy) : S.validateEffects(data, copy);
    assert.equal(verdict.ok, false, mutate.toString());
  }
  const mismatch = clone(effects); mismatch.source.dataJsonSHA256 = '0'.repeat(64);
  assert.throws(() => S.prepare(data, clone(naked), mismatch), /different talent snapshots/);
});
check('Classic baselines equal an independent mangos.sql fixture: 40 E rows, 9 class base health/mana rows, and the 6 D rows within their stated tolerance of an independent fit', () => {
  const stats = ['str', 'agi', 'sta', 'int', 'spi'], E = naked.combos.filter(c => c.baseStats.grade === 'E');
  assert.deepEqual(E.map(c => c.id).sort(), Object.keys(CLASSIC60).sort());
  for (const c of E) { const row = CLASSIC60[c.id]; assert.deepEqual(stats.map(s => c.baseStats.values[s]), row.slice(0, 5), c.id); assert.equal(c.baseStats.ref, 'sql/base/mangos.sql:' + row[5], c.id); }
  for (const [id, [hp, mana, line]] of Object.entries(CLASSIC60_BASE)) {
    const cls = naked.classes[id]; assert.equal(cls.baseHealth.value, hp, id); assert.equal(cls.baseHealth.ref, 'sql/base/mangos.sql:' + line, id);
    if (mana) { assert.equal(cls.baseMana.value, mana, id); assert.equal(cls.baseMana.ref, 'sql/base/mangos.sql:' + line, id); } else assert.equal(cls.baseMana.value, null, id);
  }
  // Median race offsets against Human and median class bases, computed from the fixture alone.
  const median = list => { const a = [...list].sort((x, y) => x - y), m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const races = ['human', 'orc', 'dwarf', 'night-elf', 'undead', 'tauren', 'gnome', 'troll'], classes = Object.keys(CLASSIC60_BASE);
  const offset = Object.fromEntries(races.map(r => { const shared = classes.filter(k => CLASSIC60[r + '-' + k] && CLASSIC60['human-' + k]); return [r, stats.map((_, i) => median(shared.map(k => CLASSIC60[r + '-' + k][i] - CLASSIC60['human-' + k][i])))]; }));
  const D = naked.combos.filter(c => c.baseStats.grade === 'D');
  assert.deepEqual(D.map(c => c.id).sort(), ['dwarf-shaman', 'gnome-priest', 'human-hunter', 'orc-mage', 'troll-warlock', 'undead-paladin']);
  for (const c of D) {
    const fitted = races.filter(r => CLASSIC60[r + '-' + c.class]);
    stats.forEach((s, i) => { const estimate = median(fitted.map(r => CLASSIC60[r + '-' + c.class][i] - offset[r][i])) + offset[c.race][i]; assert.ok(Math.abs(c.baseStats.values[s] - estimate) <= c.baseStats.tolerance[s], c.id + ' ' + s + ' ' + estimate); });
  }
});
check('Careful Aim has a melee (aura 598, A) and a ranged (aura 580, B) component; Druid candidates carry their own Predatory Strikes rule and Cat Form Agility is client data', () => {
  const melee = effects.components.find(c => c.id === 'hunter-marksmanship-careful-aim#attack_power_from_intellect'), ranged = effects.components.find(c => c.id === 'hunter-marksmanship-careful-aim#ranged_attack_power_from_intellect');
  assert.deepEqual([melee.target, melee.grade, melee.db2.effectIndex, melee.db2.aura], ['attack_power', 'A', 1, 598]);
  assert.deepEqual([ranged.target, ranged.grade, ranged.tier, ranged.db2.effectIndex, ranged.db2.aura, ranged.db2.curveId], ['ranged_attack_power', 'B', 'A', 0, 580, 82810]);
  assert.deepEqual(ranged.values, melee.values); assert.deepEqual(ranged.textSHA256, melee.textSHA256);
  assert.deepEqual(naked.classes.druid.apLevelCoefficient.candidates.map(c => [c.source, c.value, c.predatoryStrikes]), [['cmangos-7f98ba0f', 3, 'not_applied'], ['vmangos-a9fa07aa', 0, 'level_term']]);
  const cat = naked.classes.druid.formEffects; assert.equal(cat.length, 1); assert.deepEqual([cat[0].form, cat[0].spellId, cat[0].op, cat[0].sourceStat, cat[0].value, cat[0].grade, cat[0].db2.aura], ['cat', 3025, 'pct_of_stat', 'agi', 100, 'B', 598]);
  assert.deepEqual([naked.classes.druid.rangedApInForms.value, naked.classes.druid.rangedApInForms.grade, naked.classes.druid.rangedApInForms.forms], [0, 'E', ['cat', 'bear', 'dire_bear']]);
  assert.match(effects.components.find(c => c.id === 'hunter-survival-surefooted#hit_chance').note, /aura-55 spell hit effect/);
  assert.equal(naked.evaluation.stacking.grade, 'E'); assert.match(naked.evaluation.stacking.display, /two or more talents or racial traits is graded no higher than E/);
  const publicText = nakedBytes.toString('utf8') + effectsBytes.toString('utf8');
  for (const word of ['inCodexLedger', 'verifier', 'claude-r21']) assert.ok(!publicText.includes(word), word);
});
check('a changed rank text withholds only that component and never adds its number', () => {
  const changed = clone(data), talent = changed.classes.find(c => c.id === 'paladin').trees.flatMap(t => t.talents).find(t => t.id === 'paladin-holy-divine-intellect');
  talent.descriptions[4] = 'Increases your total Intellect by 99%.';
  const m = S.prepare(changed, naked, effects), result = S.evaluate(m, { className: 'paladin', race: 'human', ranks: ranksFor('paladin', [['paladin-holy-divine-intellect', 5]]) });
  assert.equal(m.components.filter(c => !c.verified).map(c => c.comp.id).join(), 'paladin-holy-divine-intellect#intellect_pct');
  assert.equal(row(result, 'int').total.value, 70); assert.equal(row(result, 'mana').total.value, 2282);
  assert.equal(result.contributions.find(c => c.talentId === 'paladin-holy-divine-intellect').group, 'withheld');
});

console.log('\n== .186 formula evaluation ==');
check('worked example 1: naked Human Paladin equals the research sheet (2201 HP, 2282 mana, 130 armor, 370 AP, 3.25% Agility crit, 4% dodge, 30.6 regen)', () => {
  const r = evaluate('paladin', 'human', []);
  const base = id => row(r, id).base;
  assert.equal(base('health').value, 2201); assert.equal(base('mana').value, 2282); assert.equal(base('armor').value, 130); assert.equal(base('meleeAP').value, 370);
  assert.equal(base('meleeCrit').value, 3.25); assert.equal(base('dodge').value, 4); assert.equal(base('parry').value, 5); assert.equal(base('block').value, 0); assert.equal(base('defense').value, 300);
  assert.ok(close(base('regenSpirit').value, 30.6)); assert.equal(base('regenSpirit').approximate, true);
  for (const id of ['str', 'health', 'mana', 'armor', 'meleeAP', 'meleeCrit', 'dodge', 'defense']) assert.equal(base(id).grade, 'E', id);
  assert.deepEqual(base('rangedAP').cands.map(c => c.value), [0, 55]);
  const spell = base('spellCrit'); assert.equal(spell.value, null); assert.ok(close(spell.cands[0].value, 5.0) && close(spell.cands[1].value, 4.63)); assert.equal(spell.disputed, true);
  // Human Ruthless is client data (B); the Human Spirit is already inside the Classic base and is not re-applied.
  assert.equal(row(r, 'meleeCrit').racial.value, 2); assert.equal(row(r, 'meleeCrit').racial.grade, 'B'); assert.equal(row(r, 'meleeCrit').total.value, 5.25);
  assert.equal(row(r, 'spi').total.value, 78); assert.equal(r.racials.find(x => x.name === 'The Human Spirit').group, 'included');
  assert.equal(row(r, 'hitMelee').total.none, true); assert.equal(row(r, 'spellDamage').total.none, true);
});
check('the evaluator reproduces the generator reference sheet for all 46 non-Skyborne combos', () => {
  for (const combo of naked.combos.filter(c => c.baseStats.grade !== 'U')) {
    const r = S.evaluate(model, { className: combo.class, race: combo.race, ranks: ranksFor(combo.class, []) }), rs = combo.referenceSheet, b = id => row(r, id).base;
    assert.equal(b('health').value, rs.maxHealth.value, combo.id);
    if (rs.maxMana.applicable !== false) { assert.equal(b('mana').value, rs.maxMana.value, combo.id); assert.ok(close(b('regenSpirit').value, rs.manaRegenPer2s.value), combo.id); }
    else assert.equal(b('power').value, rs.maxPowerNonMana.value, combo.id);
    assert.equal(b('armor').value, rs.armor.value, combo.id);
    if (rs.meleeAttackPower.value === null) assert.deepEqual(b('meleeAP').cands.map(c => c.value).sort((x, y) => x - y), rs.meleeAttackPower.candidates.map(c => c.value).sort((x, y) => x - y), combo.id);
    else assert.equal(b('meleeAP').value, rs.meleeAttackPower.value, combo.id);
    if (rs.rangedAttackPower.value === null) assert.deepEqual([...new Set(rs.rangedAttackPower.candidates.map(c => c.value))].sort((x, y) => x - y), b('rangedAP').cands.map(c => c.value).sort((x, y) => x - y), combo.id);
    else assert.equal(b('rangedAP').value, rs.rangedAttackPower.value, combo.id);
    assert.ok(close(b('meleeCrit').value, rs.critFromAgilityPct.value), combo.id); assert.ok(close(b('dodge').value, rs.dodgePct.value), combo.id);
    assert.equal(b('parry').value, rs.parryPct.value, combo.id); assert.equal(b('defense').value, rs.defenseSkill.value, combo.id);
    if (rs.spellCritPct.candidates) assert.deepEqual(b('spellCrit').cands.map(c => Math.round(c.value * 100) / 100), rs.spellCritPct.candidates.map(c => c.value), combo.id);
    else assert.equal(b('spellCrit').value, null, combo.id);
    assert.equal(b('str').grade, combo.baseStats.grade, combo.id);
  }
});
check('worked example 2: Divine Intellect 5/5 gives Int 70 to 77 and mana +105; Divine Strength, Sacred Duty and Champion of the Light follow the research', () => {
  const di = evaluate('paladin', 'human', [['paladin-holy-divine-intellect', 5]]);
  assert.equal(row(di, 'int').total.value, 77); assert.equal(row(di, 'int').talents.value, 7); assert.equal(row(di, 'int').talents.grade, 'E');
  assert.equal(row(di, 'mana').total.value, 2387); assert.equal(row(di, 'mana').talents.value, 105);
  const contribution = di.contributions.find(c => c.talentId === 'paladin-holy-divine-intellect');
  assert.equal(contribution.group, 'applied'); assert.equal(contribution.modifier, '+10% Intellect (total)'); assert.ok(contribution.effects.some(e => e.row === 'mana' && e.text === '+105'));
  const all = evaluate('paladin', 'human', [['paladin-holy-divine-intellect', 5], ['paladin-holy-divine-strength', 5], ['paladin-protection-sacred-duty', 2], ['paladin-retribution-champion-of-the-light', 3]]);
  assert.ok(close(row(all, 'str').total.value, 115.5)); assert.ok(close(row(all, 'meleeAP').talents.value, 21));
  assert.ok(close(row(all, 'sta').total.value, 104)); assert.equal(row(all, 'health').talents.value, 40);
  assert.ok(close(row(all, 'spellDamage').total.value, 23.1)); assert.ok(all.contributions.find(c => c.talentId === 'paladin-retribution-champion-of-the-light').effects.some(e => e.text === '+21'));
});
check('worked example 3: exact flat modifiers keep their own grade (Precision +3 hit A, Anticipation +20 defense A) while derived effects stay E', () => {
  const r = evaluate('paladin', 'human', [['paladin-protection-precision', 3], ['paladin-protection-anticipation', 5]]);
  assert.equal(row(r, 'hitMelee').talents.value, 3); assert.equal(row(r, 'hitMelee').talents.grade, 'A'); assert.equal(row(r, 'hitSpell').total.value, 3); assert.equal(row(r, 'hitSpell').total.grade, 'A');
  assert.equal(row(r, 'defense').talents.value, 20); assert.equal(row(r, 'defense').talents.grade, 'A'); assert.equal(row(r, 'defense').total.grade, 'E');
  assert.ok(close(row(r, 'dodge').talents.value, 0.8)); assert.equal(row(r, 'dodge').talents.grade, 'E'); assert.ok(close(row(r, 'parry').total.value, 5.8));
});
check('worked example 4: racial client data is applied where it is a sheet stat (Tauren +5% health, Night Elf +1 dodge, Gnome +5% energy)', () => {
  const tauren = evaluate('warrior', 'tauren', []); assert.equal(row(tauren, 'health').racial.value, 2760 - 2629); assert.equal(row(tauren, 'health').total.value, 2760);
  const elf = evaluate('druid', 'night-elf', []); assert.equal(row(elf, 'dodge').racial.value, 1); assert.equal(row(elf, 'dodge').racial.grade, 'B');
  const gnome = evaluate('rogue', 'gnome', [['rogue-assassination-vigor', 2]]); assert.equal(row(gnome, 'power').racial.value, 5); assert.equal(row(gnome, 'power').total.value, 116);
  assert.ok(!evaluate('mage', 'gnome', []).racials.some(r => /energy|rage/.test(r.modifier)));
});
check('Druid melee AP stays disputed (CMaNGOS 284 / vmangos 104 for a Night Elf) and is never collapsed to one value', () => {
  const r = evaluate('druid', 'night-elf', []), ap = row(r, 'meleeAP').total;
  assert.equal(ap.value, null); assert.deepEqual(ap.cands.map(c => [c.label, c.value]), [['CMaNGOS', 284], ['vmangos', 104]]);
});
check('Careful Aim raises ranged attack power through its second client effect (Night Elf Hunter: ranged 461, melee 360)', () => {
  const r = evaluate('hunter', 'night-elf', [['hunter-marksmanship-careful-aim', 5], ['hunter-survival-lightning-reflexes', 5], ['hunter-survival-surefooted', 3]]);
  assert.equal(row(r, 'rangedAP').total.value, 2 * 143 + 2 * 60 - 10 + 65); assert.equal(row(r, 'meleeAP').total.value, 2 * 60 + 52 + 143 - 20 + 65);
  const parts = r.contributions.filter(c => c.talentId === 'hunter-marksmanship-careful-aim');
  assert.deepEqual(parts.map(c => [c.grade, c.modifier]), [['A', 'melee attack power +100% of Intellect'], ['B', 'ranged attack power +100% of Intellect']]);
  assert.ok(parts[1].effects.some(e => e.row === 'rangedAP' && e.text === '+65')); assert.match(parts[1].notes.join(' '), /aura 580/);
  assert.ok(!r.contributions.some(c => c.notes.join(' ').includes('added to melee attack power only')));
});
check('Druid form candidates keep their own rule: Tauren with Predatory Strikes 3/3 is Bear 300 (CMaNGOS) / 210 (vmangos), Cat 355 / 265, and the talent adds 0 / +90', () => {
  const ps = [['druid-feral-combat-predatory-strikes', 3]], cands = cell => cell.cands.map(c => [c.label, c.value]);
  const caster = evaluate('druid', 'tauren', ps), bear = evaluate('druid', 'tauren', ps, { form: 'bear' }), cat = evaluate('druid', 'tauren', ps, { form: 'cat' });
  assert.deepEqual(cands(row(caster, 'meleeAP').total), [['CMaNGOS', 300], ['vmangos', 120]]);
  assert.deepEqual(cands(row(bear, 'meleeAP').total), [['CMaNGOS', 300], ['vmangos', 210]]);
  assert.deepEqual(cands(row(cat, 'meleeAP').total), [['CMaNGOS', 355], ['vmangos', 265]]);
  assert.deepEqual(cands(row(bear, 'meleeAP').talents), [['CMaNGOS', 0], ['vmangos', 90]]); assert.equal(row(bear, 'meleeAP').talents.grade, 'E');
  assert.deepEqual(cands(row(cat, 'meleeAP').base), [['CMaNGOS', 355], ['vmangos', 175]]);
  const contribution = bear.contributions.find(c => c.talentId === 'druid-feral-combat-predatory-strikes');
  assert.ok(contribution.effects.some(e => e.row === 'meleeAP' && e.text === 'disputed: 0 (CMaNGOS) · +90 (vmangos)' && e.grade === 'E'));
  assert.match(contribution.notes.join(' '), /CMaNGOS adds no Predatory Strikes term/);
  assert.match(cat.assumptions.join(' '), /attack power from Agility is client data/);
  // Both emulators set Druid ranged attack power to 0 in Cat, Bear and Dire Bear Form.
  for (const r of [bear, cat]) { assert.equal(row(r, 'rangedAP').total.value, 0); assert.equal(row(r, 'rangedAP').total.cands, null); assert.equal(row(r, 'rangedAP').total.grade, 'E'); }
  assert.deepEqual(row(caster, 'rangedAP').total.cands.map(c => c.value), [0, 45]);
  // A Skyborne druid's talent change stays Unavailable instead of an exact modifier that one candidate would not add.
  const sky = row(evaluate('druid', 'skyborne-windshaper', ps, { form: 'cat' }), 'meleeAP').talents; assert.equal(sky.unavailable, true); assert.equal(sky.grade, 'U');
});
check('a sum of two or more talents assumes Classic stacking and is graded E, while one talent keeps its exact grade', () => {
  const both = evaluate('druid', 'night-elf', [['druid-feral-combat-feral-swiftness', 2], ['druid-feral-combat-natural-reaction', 5]]), one = evaluate('druid', 'night-elf', [['druid-feral-combat-natural-reaction', 5]]);
  assert.equal(row(both, 'dodge').talents.value, 9); assert.equal(row(both, 'dodge').talents.grade, 'E'); assert.equal(row(both, 'dodge').talents.stacked, true);
  assert.ok(row(both, 'dodge').total.notes.some(n => /assumes Classic stacking/.test(n)));
  assert.equal(row(one, 'dodge').talents.value, 5); assert.equal(row(one, 'dodge').talents.grade, 'A'); assert.equal(row(one, 'dodge').talents.stacked, false);
});
check('a flat talent bonus is shown as its own modifier, separate from the rounded sheet change (Gnome Vigor +10, sheet +11)', () => {
  const r = evaluate('rogue', 'gnome', [['rogue-assassination-vigor', 2]]), vigor = r.contributions.find(c => c.talentId === 'rogue-assassination-vigor');
  assert.deepEqual(vigor.effects.map(e => [e.label, e.text, e.grade]), [['Maximum energy', '+10 (modifier)', 'A'], ['Maximum energy on the sheet', '+11 after percentage bonuses and Classic rounding', 'E']]);
  assert.equal(evaluate('rogue', 'human', [['rogue-assassination-vigor', 2]]).contributions.find(c => c.talentId === 'rogue-assassination-vigor').effects.map(e => e.text).join(), '+10');
  assert.match(r.racials.find(x => x.name === 'Expansive Mind').note, /Gnome Intellect may be about 5% high/);
});
check('per-component caveats from the data are shown with each contribution (Thick Hide defense armor, Surefooted spell hit)', () => {
  assert.match(evaluate('druid', 'tauren', [['druid-feral-combat-thick-hide', 3]], { form: 'bear' }).contributions.find(c => c.talentId === 'druid-feral-combat-thick-hide').notes.join(' '), /per defense point above 5x level is not modelled/);
  assert.match(evaluate('hunter', 'orc', [['hunter-survival-surefooted', 3]]).contributions[0].notes.join(' '), /aura-55 spell hit effect .* not added/);
});
check('ranged AP is disputed for Warrior and Rogue (2 vs 1 per Agility) and single only for Hunter; Warrior spell crit is Unavailable', () => {
  const w = row(evaluate('warrior', 'human', []), 'rangedAP').total; assert.equal(w.value, null); assert.deepEqual(w.cands.map(c => c.value), [210, 130]);
  const h = row(evaluate('hunter', 'dwarf', []), 'rangedAP').total; assert.equal(h.cands, null); assert.equal(h.value, 2 * 121 + 120 - 10);
  const sc = row(evaluate('warrior', 'human', []), 'spellCrit'); assert.equal(sc.total.value, null); assert.equal(sc.total.cands, null); assert.equal(sc.total.grade, 'U');
});
check('Skyborne totals are Unavailable, never 0, while exact talent modifiers remain visible in modifier terms', () => {
  const r = evaluate('hunter', 'skyborne-windshaper', [['hunter-survival-lightning-reflexes', 5], ['hunter-survival-deflection', 5]]);
  for (const id of ['str', 'agi', 'sta', 'int', 'spi', 'health', 'mana', 'armor', 'meleeAP', 'rangedAP', 'meleeCrit', 'dodge']) { assert.equal(row(r, id).total.value, null, id); assert.equal(row(r, id).total.grade, 'U', id); assert.equal(row(r, id).base.value, null, id); }
  assert.equal(row(r, 'agi').talents.value, null); assert.deepEqual(row(r, 'agi').talents.modifiers.map(m => [m.kind, m.value]), [['factor', 10]]);
  assert.equal(row(r, 'parry').talents.value, 5); assert.equal(row(r, 'parry').talents.grade, 'A');
});
check('naked means no gear: Toughness adds 0, Earth Fury is gear-bound, Hack and Slash and Weaponmaster need a weapon assumption', () => {
  const tough = evaluate('paladin', 'dwarf', [['paladin-protection-toughness', 5]]);
  assert.equal(row(tough, 'armor').talents.value, 0); assert.equal(tough.contributions.find(c => c.talentId === 'paladin-protection-toughness').group, 'gear');
  assert.equal(tough.racials.find(r => r.name === 'Earth Fury').group, 'gear');
  assert.equal(evaluate('warrior', 'dwarf', [], { weapon: 'mace-2h' }).racials.find(r => r.name === 'Earth Fury').group, 'throughput');
  const rogue = evaluate('rogue', 'human', [['rogue-combat-hack-and-slash', 5]]); assert.equal(row(rogue, 'meleeCrit').talents.value, 0);
  assert.equal(row(evaluate('rogue', 'human', [['rogue-combat-hack-and-slash', 5]], { weapon: 'dagger' }), 'meleeCrit').talents.value, 5);
});

console.log('\n== .186 conditional components ==');
check('conditional components are excluded from totals by default and added only by their matching assumption', () => {
  const shieldOff = evaluate('warrior', 'human', [['warrior-protection-shield-specialization', 5]]);
  assert.equal(row(shieldOff, 'block').total.value, 0); assert.equal(shieldOff.contributions.find(c => c.talentId === 'warrior-protection-shield-specialization').group, 'gear');
  const shieldOn = evaluate('warrior', 'human', [['warrior-protection-shield-specialization', 5]], { shield: true });
  assert.equal(row(shieldOn, 'block').total.value, 10); assert.ok(shieldOn.assumptions.some(a => /shield/.test(a)));
  const bear = [['druid-feral-combat-heart-of-the-wild', 5]];
  assert.equal(row(evaluate('druid', 'tauren', bear), 'sta').total.value, 72);
  assert.ok(close(row(evaluate('druid', 'tauren', bear, { form: 'bear' }), 'sta').total.value, 86.4));
  assert.ok(close(row(evaluate('druid', 'tauren', bear, { form: 'cat' }), 'str').total.value, 77));
  const monkey = [['hunter-beast-mastery-improved-aspect-of-the-monkey', 3]];
  assert.equal(row(evaluate('hunter', 'orc', monkey), 'dodge').talents.value, 0);
  assert.equal(row(evaluate('hunter', 'orc', monkey, { buffs: ['Aspect of the Monkey'] }), 'dodge').talents.value, 6);
  const demon = [['warlock-demonology-demonic-knowledge', 3]];
  assert.equal(row(evaluate('warlock', 'human', demon), 'spellDamage').total.none, true);
  assert.equal(evaluate('warlock', 'human', demon).contributions.find(c => c.talentId === 'warlock-demonology-demonic-knowledge').group, 'conditional');
  assert.equal(row(evaluate('warlock', 'human', demon, { pet: 'demon' }), 'spellDamage').total.value, 60);
  assert.equal(row(evaluate('warlock', 'human', demon, { pet: 'demon' }), 'spellDamage').total.grade, 'A');
});
check('scoped, proc and throughput components are listed separately and never added', () => {
  const r = evaluate('priest', 'human', [['priest-shadow-spirit-tap', 5], ['priest-holy-holy-specialization', 5], ['priest-holy-spiritual-healing', 3]]);
  assert.equal(row(r, 'spi').total.value, 131); assert.equal(row(r, 'regenCasting').total.none, true);
  const group = id => r.contributions.filter(c => c.talentId === id).map(c => c.group);
  assert.deepEqual(group('priest-shadow-spirit-tap'), ['proc', 'proc']); assert.deepEqual(group('priest-holy-holy-specialization'), ['scoped']); assert.deepEqual(group('priest-holy-spiritual-healing'), ['throughput']);
  assert.equal(row(r, 'spellCrit').talents.value, 0);
});
check('the Spirit Weapons parry grant has no published value, so Shaman parry becomes Unavailable instead of a guess', () => {
  assert.ok(talentsOf('shaman').some(t => t.id === 'shaman-enhancement-spirit-weapons'));
  const r = evaluate('shaman', 'orc', [['shaman-enhancement-spirit-weapons', 1]]); assert.equal(row(r, 'parry').total.value, null); assert.equal(row(r, 'parry').base.value, 0);
  // The change itself is Unavailable (never "no change"), and the talent is listed with an Unavailable grade.
  assert.equal(row(r, 'parry').talents.unavailable, true); assert.equal(row(r, 'parry').talents.grade, 'U');
  const grant = r.contributions.find(c => c.talentId === 'shaman-enhancement-spirit-weapons');
  assert.deepEqual([grant.grade, grant.group, grant.effects[0].row, grant.effects[0].text], ['U', 'applied', 'parry', 'Unavailable (value not published)']);
});

console.log('\n== .186 CSP and loading rules ==');
check('stats60.js uses no HTML or code injection sink, inline style or embedded/custom art reference', () => {
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|\.style\b|setAttribute\(["']style/.test(source));
  assert.ok(!/(?:data\s*:\s*(?:image|font|application\/font))|<\s*svg\b/i.test(source));
  assert.ok(source.includes('createElementNS') && source.includes('"' + SVG_NS + '"'));
  assert.deepEqual([...new Set(source.match(/\/static\/[A-Za-z0-9_./-]*/g))].sort(), ['/static/talents/naked60-186.json', '/static/talents/stat-effects186.json']);
  new vm.Script(source);
});
check('calculator.js remains free of injection sinks and inline styles after the optional sheet wiring', () => {
  assert.ok(!/innerHTML|eval\(|new Function|\.style\b|setAttribute\(["']style/.test(calculatorSource));
  assert.ok(calculatorSource.includes('statsView?.update(build)') && calculatorSource.includes('options.loadStats60'));
});
check('the stylesheet scopes the sheet, adds no asset URL and respects reduced motion and forced colors', () => {
  assert.ok(!/url\(/i.test(css)); assert.ok(css.includes('@media(prefers-reduced-motion:reduce){.talents-stats60 *,.talents-stats60-host *{animation:none!important;transition:none!important}}'));
  assert.ok(css.includes('.talents-stats60 [hidden]{display:none!important}') && css.includes('@media(max-width:560px){'));
  assert.ok(css.includes('@media(forced-colors:active){.talents-stats60'));
  // The flex summary keeps a visible expand cue (generated content with empty alternative text), like the site's nav groups.
  assert.ok(css.includes('.talents-stats60-host>summary::before{content:"\\25B8";content:"\\25B8"/""') && css.includes('.talents-stats60-host[open]>summary::before{content:"\\25BE";content:"\\25BE"/""}'));
  // Restacked cell labels are visual only; the empty live region keeps no visible box; chart rows are no longer focus targets.
  assert.ok(css.includes('content:attr(data-label);content:attr(data-label)/"";') && css.includes('.talents-stats60 .s60-assumption:empty{margin:0;padding:0;border:0}'));
  assert.ok(!css.includes('.s60-chart-row:focus-visible'));
});
// .189: the .185 all-or-nothing pair (Promise.all) became the .188 settled optional pair (Promise.allSettled); the sheet stays outside
// it and its lazy loader follows the same settled rule (behaviour pinned in frontend169).
check('app.js loads the sheet independently and lazily, outside the optional pair, with the .188 settled rule', () => {
  const route = appSource.slice(appSource.indexOf('  ROUTES.talents = '), appSource.indexOf('  const resourcesView ='));
  const start = route.indexOf('const optional = ['), pair = start < 0 ? '' : route.slice(start, route.indexOf('];', start) + 2);
  assert.ok(pair.includes('/static/talents/analysis.js') && pair.includes('/static/talents/guide-builds179.js') && !pair.includes('stats60'));
  assert.ok(route.includes('await Promise.allSettled(optional.map(([, namespace, file]) => loadMemberScript(namespace, file)));') && !route.includes('Promise.all(['));
  assert.equal(appSource.split('loadMemberScript("OlympusTalentStats60", "/static/talents/stats60.js")').length, 2);
  assert.ok(route.includes('loadStats60: () => Promise.allSettled([loadMemberScript("OlympusTalentStats60", "/static/talents/stats60.js")]).then(() => {\n'
    + '        if (!window.OlympusTalentStats60) toolScripts.delete("OlympusTalentStats60");\n        return window.OlympusTalentStats60;\n      }),'));
});

// A small DOM with the methods the calculator and the sheet use; null children coerce to text like browsers.
class FakeText { constructor(value) { this.nodeType = 3; this.data = String(value); this.parentNode = null; } get textContent() { return this.data; } set textContent(v) { this.data = String(v); } }
class FakeElement {
  constructor(tag, document, ns = null) { this.tagName = ns ? tag : tag.toUpperCase(); this.namespaceURI = ns || 'http://www.w3.org/1999/xhtml'; this.ownerDocument = document; this.nodeType = 1; this.childNodes = []; this.attributes = {}; this.listeners = {}; this.className = ''; this.value = ''; this.parentNode = null; this.hidden = false; this.open = false; this.checked = false; }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  append(...nodes) { for (const value of nodes) { const node = value instanceof FakeElement || value instanceof FakeText ? value : this.ownerDocument.createTextNode(String(value)); if (node.parentNode) node.parentNode.childNodes.splice(node.parentNode.childNodes.indexOf(node), 1); node.parentNode = this; this.childNodes.push(node); } }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) { for (const node of this.childNodes) node.parentNode = null; this.childNodes = []; this.append(...nodes); }
  remove() { if (this.parentNode) { this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1); this.parentNode = null; } }
  set textContent(value) { this.replaceChildren(this.ownerDocument.createTextNode(value)); }
  get textContent() { return this.childNodes.map(node => node.textContent).join(''); }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key === 'src') this.srcAssignments = (this.srcAssignments || 0) + 1; }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  dispatch(type, extra = {}) { const event = { target: this, currentTarget: this, shiftKey: false, preventDefault() {}, ...extra }; for (const handler of this.listeners[type] || []) handler(event); return event; }
  focus() { this.ownerDocument.activeElement = this; }
  click() { if (!this.disabled) this.dispatch('click'); }
  contains(node) { for (let current = node; current; current = current.parentNode) if (current === this) return true; return false; }
  all(predicate) { return this.children.flatMap(node => [...(predicate(node) ? [node] : []), ...node.all(predicate)]); }
  querySelectorAll(selector) { if (selector !== 'img') throw Error('Only the native image query is used by this fixture.'); return this.all(node => node.tagName === 'IMG'); }
}
const makeDocument = () => { const document = { activeElement: null, createElement(tag) { return new FakeElement(tag, document); }, createElementNS(ns, tag) { return new FakeElement(tag, document, ns); }, createTextNode(value) { return new FakeText(value); } }; return document; };
const byClass = (node, name) => node.all(child => typeof child.className === 'string' && child.className.split(/\s+/).includes(name));
const settle = async (rounds = 6) => { for (let i = 0; i < rounds; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
const sheetRow = (host, id) => host.all(n => n.tagName === 'TR' && n.getAttribute('data-row') === id)[0];
const cellValue = (tr, index) => tr.children[index + 1].all(n => n.className === 's60-value')[0].textContent;
const cellGrade = (tr, index) => { const mark = tr.children[index + 1].all(n => n.tagName === 'ABBR')[0]; return mark.hidden ? null : mark.textContent; };
const guidesFor = cls => guideData.records.filter(r => r.className === cls).map(r => ({ id: r.id, label: r.label, build: C.parseBuild(data, r.code).build }));

console.log('\n== .186 DOM rendering ==');
check('the mounted sheet renders graded cells, a greyed Classic label, an SVG chart with an equivalent table and no style attribute', async () => {
  const document = makeDocument(), host = document.createElement('div');
  const build = legalBuild('paladin', [['paladin-holy-divine-intellect', 5]]);
  const ui = S.mount(host, { data, build, naked, effects, guides: guidesFor('paladin') });
  assert.equal(await ui.ready, true);
  const rootNode = byClass(host, 'talents-stats60')[0]; assert.ok(rootNode);
  const race = host.all(n => n.tagName === 'SELECT' && n.getAttribute('aria-label') === 'Race')[0];
  assert.deepEqual(race.children.map(o => o.getAttribute('value')), ['human', 'dwarf', 'undead']); assert.equal(race.value, 'human');
  assert.match(race.children[2].textContent, /estimate/);
  const mana = sheetRow(host, 'mana'); assert.equal(cellValue(mana, 0), '2282'); assert.equal(cellGrade(mana, 0), 'E'); assert.equal(cellValue(mana, 2), '+105'); assert.equal(cellValue(mana, 3), '2387'); assert.ok(mana.children[4].className.includes('s60-ref'));
  const crit = sheetRow(host, 'meleeCrit'); assert.equal(cellValue(crit, 1), '+2 pp'); assert.equal(cellGrade(crit, 1), 'B');
  const spell = sheetRow(host, 'spellCrit'); assert.match(cellValue(spell, 0), /^disputed: 5% \(CMaNGOS\) · 4\.63% \(warcraft\.wiki\.gg\)$/);
  const ranged = sheetRow(host, 'rangedAP'); assert.match(cellValue(ranged, 3), /^disputed: 0 \(0 per Agility/);
  const hit = sheetRow(host, 'hitMelee'); assert.equal(cellValue(hit, 0), 'none'); assert.equal(cellGrade(hit, 0), null);
  assert.match(rootNode.textContent, /Classic reference — not Forever-verified/);
  assert.match(byClass(host, 's60-provenance')[0].textContent, /^Base attributes: Classic reference — not Forever-verified \(CMaNGOS sql\/base\/mangos\.sql:5652\)/);
  const svgs = host.all(n => n.tagName === 'svg'); assert.ok(svgs.length >= 15 && svgs.every(n => n.namespaceURI === SVG_NS && n.getAttribute('aria-hidden') === 'true' && n.getAttribute('viewBox') === '0 0 200 14'));
  assert.ok(host.all(n => n.namespaceURI === SVG_NS && n.tagName === 'rect').every(n => /^-?[0-9.]+$/.test(n.getAttribute('x')) && /^[0-9.]+$/.test(n.getAttribute('width'))));
  const chartRows = byClass(host, 's60-chart-row'), chartTable = byClass(host, 's60-chart-table')[0];
  assert.equal(chartRows.length, chartTable.all(n => n.tagName === 'TR').length - 1);
  // Rows have no action, so they are not tab stops; the Chart data table carries the same values for keyboard users.
  assert.ok(chartRows.every(r => r.getAttribute('tabindex') === null && r.getAttribute('role') === 'listitem' && r.getAttribute('aria-label')));
  // No nullable child is ever coerced to visible text (a class with checked guide builds used to render a literal "null").
  const textNodes = node => node.childNodes.flatMap(child => child instanceof FakeText ? [child] : textNodes(child));
  assert.ok(textNodes(host).every(t => t.data !== 'null' && t.data !== 'undefined'));
  // Guide columns already name their point split; only the computed columns add one.
  const heads = byClass(host, 's60-compare')[0].all(n => n.tagName === 'THEAD')[0].all(n => n.tagName === 'TH').slice(1);
  assert.deepEqual(heads.map(th => th.children.length), [2, 2, ...guidesFor('paladin').map(() => 1)]);
  const live = byClass(host, 's60-assumption')[0]; assert.equal(live.hidden, false); assert.equal(live.textContent, ''); assert.equal(live.getAttribute('aria-live'), 'polite');
  const intRow = chartRows.find(r => r.getAttribute('aria-label').startsWith('Intellect:')); assert.match(intRow.getAttribute('aria-label'), /^Intellect: \+10% versus no talents, grade E/);
  assert.ok(host.all(() => true).every(n => !('style' in n.attributes)));
  const applied = byClass(host, 's60-group-applied')[0]; assert.match(applied.textContent, /Divine Intellect/); assert.match(applied.textContent, /Mana \+105/);
  const about = byClass(host, 's60-about')[0].textContent;
  assert.match(about, /cropped to the stat panel only/); assert.match(about, /135 also equal the client's own talent curves \(grade A/); assert.match(about, /6 carry a semantic reading of client data \(grade B/);
  assert.match(about, /1\.60\.1\.70009 is not used/); assert.ok(byClass(host, 's60-about')[0].tagName === 'DETAILS' && !host.all(n => n.tagName === 'A' || n.tagName === 'IMG').length);
  ui.destroy(); assert.equal(byClass(host, 'talents-stats60').length, 0);
});
check('updates repaint the same rows in place; race and assumption controls recompute; Skyborne shows Unavailable, never 0', async () => {
  const document = makeDocument(), host = document.createElement('div');
  let build = legalBuild('warrior', [['warrior-protection-shield-specialization', 5]]);
  const ui = S.mount(host, { data, build, naked, effects, guides: guidesFor('warrior') }); await ui.ready;
  const block = sheetRow(host, 'block'), table = byClass(host, 's60-sheet')[0];
  assert.equal(cellValue(block, 3), '0%'); assert.match(byClass(host, 's60-group-gear')[0].textContent, /Shield Specialization/);
  const shield = host.all(n => n.tagName === 'INPUT' && n.getAttribute('type') === 'checkbox')[0]; shield.checked = true; shield.dispatch('change');
  assert.equal(cellValue(block, 3), '10%'); assert.equal(sheetRow(host, 'block'), block); assert.equal(byClass(host, 's60-sheet')[0], table);
  assert.match(byClass(host, 's60-assumption')[0].textContent, /^Hypothetical, not naked: a shield equipped/);
  build = C.emptyBuild(data, 'warrior', 60); ui.update(build);
  assert.equal(cellValue(block, 3), '5%'); assert.equal(sheetRow(host, 'block'), block);
  const race = host.all(n => n.tagName === 'SELECT' && n.getAttribute('aria-label') === 'Race')[0];
  race.value = 'skyborne-high-order'; race.dispatch('change');
  for (const id of ['str', 'health', 'armor', 'meleeAP', 'dodge']) { const tr = sheetRow(host, id); assert.equal(cellValue(tr, 0), 'Unavailable', id); assert.equal(cellGrade(tr, 0), 'U', id); assert.equal(cellValue(tr, 3), 'Unavailable', id); }
  assert.ok(!sheetRow(host, 'str').textContent.includes('0 '));
  race.value = 'orc'; race.dispatch('change');
  assert.equal(cellGrade(sheetRow(host, 'str'), 0), 'E'); assert.equal(cellValue(sheetRow(host, 'str'), 0), '123');
  ui.destroy();
  const estimateHost = document.createElement('div'), estimate = S.mount(estimateHost, { data, build: C.emptyBuild(data, 'paladin', 60), naked, effects }); await estimate.ready;
  const paladinRace = estimateHost.all(n => n.tagName === 'SELECT' && n.getAttribute('aria-label') === 'Race')[0]; paladinRace.value = 'undead'; paladinRace.dispatch('change');
  assert.equal(cellGrade(sheetRow(estimateHost, 'str'), 0), 'D'); assert.ok(sheetRow(estimateHost, 'str').children[1].className.includes('s60-ref'));
  assert.match(byClass(estimateHost, 's60-provenance')[0].textContent, /derived estimate from Classic reference — not Forever-verified/);
  estimate.destroy();
});
check('Unavailable rows never show an exact zero: no-change rows say so without a grade, and a talent that makes a row Unavailable is shown as Unavailable', async () => {
  const document = makeDocument(), chartRow = (host, label) => byClass(host, 's60-chart-table')[0].all(n => n.tagName === 'TR').find(tr => tr.children[0].textContent === label).children.slice(1).map(td => td.textContent);
  const warriorHost = document.createElement('div'), warrior = S.mount(warriorHost, { data, build: C.emptyBuild(data, 'warrior', 60), naked, effects }); await warrior.ready;
  const race = warriorHost.all(n => n.tagName === 'SELECT' && n.getAttribute('aria-label') === 'Race')[0]; race.value = 'tauren'; race.dispatch('change');
  assert.deepEqual(chartRow(warriorHost, 'Spell crit %'), ['Unavailable', 'Unavailable', 'no talent change', '—']);
  race.value = 'skyborne-windshaper'; race.dispatch('change');
  assert.deepEqual(chartRow(warriorHost, 'Strength'), ['Unavailable', 'Unavailable', 'no talent change', '—']);
  warrior.destroy();
  const shamanHost = document.createElement('div'), shaman = S.mount(shamanHost, { data, build: legalBuild('shaman', [['shaman-enhancement-spirit-weapons', 1]]), naked, effects }); await shaman.ready;
  const parry = sheetRow(shamanHost, 'parry'); assert.equal(cellValue(parry, 2), 'Unavailable'); assert.equal(cellGrade(parry, 2), 'U'); assert.equal(cellValue(parry, 3), 'Unavailable');
  assert.deepEqual(chartRow(shamanHost, 'Parry %'), ['0%', 'Unavailable', 'Unavailable', 'U — Unavailable']);
  const contrib = byClass(shamanHost, 's60-contrib')[0].textContent; assert.match(contrib, /Spirit Weapons/); assert.match(contrib, /not published/); assert.ok(!/No allocated talent has a stat component/.test(contrib));
  shaman.destroy();
});
check('.193: with both totals Unavailable, a rank change on the same modifier is a modifier-space change or Unavailable, never "no talent change"', async () => {
  const document = makeDocument(), chartRow = (host, label) => byClass(host, 's60-chart-table')[0].all(n => n.tagName === 'TR').find(tr => tr.children[0].textContent === label).children.slice(1).map(td => td.textContent);
  const guides = guidesFor('druid'), method = guides.find(g => g.id === 'druid-method-1'), hotw = talentsOf('druid').findIndex(t => t.id === 'druid-feral-combat-heart-of-the-wild');
  assert.ok(method); assert.equal(method.build.ranks[hotw], 3);
  const step = C.allocate(data, method.build, 'druid-feral-combat-heart-of-the-wild', 1); assert.ok(step.ok); assert.equal(step.build.ranks[hotw], 4);
  const host = document.createElement('div'), ui = S.mount(host, { data, build: step.build, naked, effects, guides }); assert.equal(await ui.ready, true);
  const race = host.all(n => n.tagName === 'SELECT' && n.getAttribute('aria-label') === 'Race')[0]; race.value = 'skyborne-high-order'; race.dispatch('change');
  const reference = host.all(n => n.tagName === 'SELECT' && n.getAttribute('aria-label') === 'Compare the current build with')[0]; reference.value = method.id; reference.dispatch('change');
  // Heart of the Wild 4/5 against 3/5 keeps the key #intellect_pct: the factors 1.08 and 1.06 differ by about +1.9%.
  const intellect = chartRow(host, 'Intellect');
  assert.deepEqual(intellect.slice(0, 3), ['Unavailable', 'Unavailable', '+1.9% (modifier)']); assert.match(intellect[3], /^A — /);
  // Mana and spell crit change only through Intellect, so no modifier value can be stated for them: Unavailable.
  assert.deepEqual(chartRow(host, 'Mana').slice(2), ['Unavailable', 'U — Unavailable']);
  assert.deepEqual(chartRow(host, 'Spell crit %').slice(2), ['Unavailable', 'U — Unavailable']);
  // Control: a row the rank change does not reach, and the identical guide build, still say "no talent change".
  assert.deepEqual(chartRow(host, 'Strength'), ['Unavailable', 'Unavailable', 'no talent change', '—']);
  ui.update(method.build);
  for (const label of ['Intellect', 'Mana', 'Spell crit %', 'Strength']) assert.deepEqual(chartRow(host, label), ['Unavailable', 'Unavailable', 'no talent change', '—'], label);
  ui.destroy();
});
check('the Gnome Intellect caveat is shown, weapon choices are the class-relevant ones with the visible label as name, and errors read as fixed sentences', async () => {
  const document = makeDocument(), host = document.createElement('div'), ui = S.mount(host, { data, build: C.emptyBuild(data, 'mage', 60), naked, effects }); await ui.ready;
  const race = host.all(n => n.tagName === 'SELECT' && n.getAttribute('aria-label') === 'Race')[0]; race.value = 'gnome'; race.dispatch('change');
  assert.match(byClass(host, 's60-provenance')[0].textContent, /percentage racial attribute traits are not applied again\. Forever Expansive Mind is \+5% maximum Mana\/Rage\/Energy, not Intellect, so Classic-reference Gnome Intellect may be about 5% high/);
  assert.match(byClass(host, 's60-group-racial')[0].textContent, /Gnome Intellect may be about 5% high/);
  ui.destroy();
  for (const [cls, options] of [['warrior', ['', 'axe-1h', 'axe-2h', 'polearm']], ['rogue', ['', 'dagger', 'fist']]]) {
    const node = document.createElement('div'), view = S.mount(node, { data, build: C.emptyBuild(data, cls, 60), naked, effects }); await view.ready;
    const weapon = node.all(n => n.tagName === 'SELECT' && n.getAttribute('aria-label') === 'Weapon (hypothetical)')[0];
    assert.ok(weapon, cls); assert.deepEqual(weapon.children.map(o => o.getAttribute('value')), options, cls);
    assert.equal(weapon.parentNode.children[0].textContent, 'Weapon (hypothetical)');
    view.destroy();
  }
  const html = document.createElement('div'), broken = S.mount(html, { data, build: C.emptyBuild(data, 'mage', 60), fetch: async () => ({ ok: true, json: async () => { throw new SyntaxError('Unexpected token \'<\', "<!doctype html>" is not valid JSON'); } }) });
  assert.equal(await broken.ready, false); assert.match(html.textContent, /^The level-60 data could not be loaded\. The level-60 sheet is unavailable; the talent calculator is not affected\.$/); assert.ok(!/Unexpected token|doctype/.test(html.textContent));
  const offline = document.createElement('div'), failing = S.mount(offline, { data, build: C.emptyBuild(data, 'mage', 60), fetch: async () => { throw new TypeError('Failed to fetch'); } });
  assert.equal(await failing.ready, false); assert.ok(!/Failed to fetch/.test(offline.textContent) && /could not be loaded/.test(offline.textContent));
});
check('an unchanged build repaints nothing: contributions and the live assumption text keep their nodes', async () => {
  const document = makeDocument(), host = document.createElement('div'), build = legalBuild('warrior', [['warrior-protection-shield-specialization', 5]]);
  const ui = S.mount(host, { data, build, naked, effects }); await ui.ready;
  const shield = host.all(n => n.tagName === 'INPUT' && n.getAttribute('type') === 'checkbox')[0]; shield.checked = true; shield.dispatch('change');
  const contrib = byClass(host, 's60-contrib')[0], first = contrib.childNodes[0], live = byClass(host, 's60-assumption')[0], text = live.childNodes[0];
  assert.match(live.textContent, /^Hypothetical, not naked: a shield equipped/);
  ui.update({ ...build }); ui.update({ ...build, ranks: [...build.ranks] });
  assert.equal(contrib.childNodes[0], first); assert.equal(live.childNodes[0], text);
  ui.update(C.emptyBuild(data, 'warrior', 60)); assert.notEqual(contrib.childNodes[0], first); assert.equal(live.childNodes[0], text);
  ui.destroy();
});
check('the spec comparison shows no talents, the current build and every checked guide build for the class', async () => {
  const document = makeDocument(), host = document.createElement('div'), guides = guidesFor('mage');
  const ui = S.mount(host, { data, build: guides[0].build, naked, effects, guides }); await ui.ready;
  const compare = byClass(host, 's60-compare')[0], head = compare.all(n => n.tagName === 'THEAD')[0];
  assert.equal(head.all(n => n.tagName === 'TH').length, 2 + 2 + 1);
  assert.match(head.textContent, /No talents/); assert.match(head.textContent, /Current build/); assert.ok(guides.every(g => head.textContent.includes(g.label)));
  assert.ok(head.textContent.includes(guides[0].build.ranks.length ? '0 / 0 / 21 points' : ''));
  const reference = host.all(n => n.tagName === 'SELECT' && n.getAttribute('aria-label') === 'Compare the current build with')[0];
  reference.value = guides[0].id; reference.dispatch('change');
  const intRow = byClass(host, 's60-chart-row').find(r => r.getAttribute('aria-label').startsWith('Intellect:'));
  assert.match(intRow.getAttribute('aria-label'), new RegExp('^Intellect: 0% versus ' + guides[0].label.replace(/[()+.]/g, '\\$&')));
  ui.destroy();
});
check('a sheet with missing or mismatched data reports itself and throws nothing', async () => {
  const document = makeDocument(), host = document.createElement('div');
  const bad = clone(naked); bad.build.talentRevision = '000000000000';
  const ui = S.mount(host, { data, build: C.emptyBuild(data, 'mage', 60), naked: bad, effects }); assert.equal(await ui.ready, false);
  assert.match(host.textContent, /does not match this talent snapshot/); assert.match(host.textContent, /calculator is not affected/);
  const failing = S.mount(document.createElement('div'), { data, build: C.emptyBuild(data, 'mage', 60), fetch: async () => ({ ok: false }) }); assert.equal(await failing.ready, false);
});

check('.193: HTTP 200 semantic data failures are retryable with the same fetcher, while concurrent healthy remounts reuse validated data', async () => {
  for (const invalid of ['naked revision', 'effects revision']) {
    const document = makeDocument(), urls = [], build = C.emptyBuild(data, 'mage', 60);
    let healthy = false;
    const fetcher = async url => {
      urls.push(url);
      return { ok: true, json: async () => {
        const value = clone(url === S.urls.naked ? naked : effects);
        if (!healthy && invalid === 'naked revision' && url === S.urls.naked) value.build.talentRevision = '000000000000';
        if (!healthy && invalid === 'effects revision' && url === S.urls.effects) value.source.talentRevision = '000000000000';
        return value;
      } };
    };
    const firstHost = document.createElement('div'), first = S.mount(firstHost, { data, build, fetch: fetcher });
    assert.equal(await first.ready, false, invalid); assert.match(firstHost.textContent, /does not match|snapshot revision changed/); first.destroy();
    assert.deepEqual(urls, [S.urls.naked, S.urls.effects]);
    healthy = true;
    const nextHost = document.createElement('div'), next = S.mount(nextHost, { data, build, fetch: fetcher });
    const concurrentHost = document.createElement('div'), concurrent = S.mount(concurrentHost, { data, build, fetch: fetcher });
    assert.deepEqual(await Promise.all([next.ready, concurrent.ready]), [true, true], invalid);
    assert.deepEqual(urls, [S.urls.naked, S.urls.effects, S.urls.naked, S.urls.effects]);
    assert.ok(sheetRow(nextHost, 'health')); assert.ok(sheetRow(concurrentHost, 'health'));
    const reuseHost = document.createElement('div'), reuse = S.mount(reuseHost, { data, build, fetch: fetcher });
    assert.equal(await reuse.ready, true); assert.equal(urls.length, 4); assert.ok(sheetRow(reuseHost, 'health'));
    next.destroy(); concurrent.destroy(); reuse.destroy();
  }
});
check('.193: a rejected data request is evicted before a healthy retry with the same fetcher', async () => {
  const document = makeDocument(), urls = [], build = C.emptyBuild(data, 'mage', 60);
  let rejecting = true;
  const fetcher = async url => { urls.push(url); if (rejecting && url === S.urls.naked) throw Error('synthetic network rejection'); return { ok: true, json: async () => clone(url === S.urls.naked ? naked : effects) }; };
  const first = S.mount(document.createElement('div'), { data, build, fetch: fetcher });
  assert.equal(await first.ready, false); assert.deepEqual(urls, [S.urls.naked, S.urls.effects]); first.destroy();
  rejecting = false;
  const retryHost = document.createElement('div'), retry = S.mount(retryHost, { data, build, fetch: fetcher });
  assert.equal(await retry.ready, true); assert.deepEqual(urls, [S.urls.naked, S.urls.effects, S.urls.naked, S.urls.effects]); assert.ok(sheetRow(retryHost, 'health')); retry.destroy();
});

check('.193: destroying a pending sheet still evicts invalid HTTP 200 data before its first healthy remount', async () => {
  for (const invalid of ['naked revision', 'effects revision']) {
    const document = makeDocument(), urls = [], build = C.emptyBuild(data, 'mage', 60);
    let healthy = false, release;
    const pending = new Promise(resolve => { release = resolve; });
    const fetcher = async url => {
      urls.push(url);
      const value = clone(url === S.urls.naked ? naked : effects);
      if (!healthy && invalid === 'naked revision' && url === S.urls.naked) value.build.talentRevision = '000000000000';
      if (!healthy && invalid === 'effects revision' && url === S.urls.effects) value.source.talentRevision = '000000000000';
      if (!healthy) await pending;
      return { ok: true, json: async () => value };
    };
    const abandonedHost = document.createElement('div'), abandoned = S.mount(abandonedHost, { data, build, fetch: fetcher });
    const detached = abandonedHost.childNodes[0], originalText = detached.textContent;
    assert.deepEqual(urls, [S.urls.naked, S.urls.effects]); abandoned.destroy(); assert.equal(abandonedHost.childNodes.length, 0);
    release(); assert.equal(await abandoned.ready, false); assert.equal(abandonedHost.childNodes.length, 0); assert.equal(detached.textContent, originalText);
    healthy = true;
    const retryHost = document.createElement('div'), retry = S.mount(retryHost, { data, build, fetch: fetcher });
    assert.equal(await retry.ready, true, invalid); assert.deepEqual(urls, [S.urls.naked, S.urls.effects, S.urls.naked, S.urls.effects]); assert.ok(sheetRow(retryHost, 'health')); retry.destroy();
  }
});
check('.193: destroying a pending sheet preserves valid data for reuse without constructing or reporting into the dead view', async () => {
  const document = makeDocument(), urls = [], build = C.emptyBuild(data, 'mage', 60);
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const fetcher = async url => { urls.push(url); await pending; return { ok: true, json: async () => clone(url === S.urls.naked ? naked : effects) }; };
  const abandonedHost = document.createElement('div'), abandoned = S.mount(abandonedHost, { data, build, fetch: fetcher });
  const detached = abandonedHost.childNodes[0], originalText = detached.textContent;
  assert.deepEqual(urls, [S.urls.naked, S.urls.effects]); abandoned.destroy(); release();
  assert.equal(await abandoned.ready, false); assert.equal(abandonedHost.childNodes.length, 0); assert.equal(detached.textContent, originalText);
  const retryHost = document.createElement('div'), retry = S.mount(retryHost, { data, build, fetch: fetcher });
  assert.equal(await retry.ready, true); assert.deepEqual(urls, [S.urls.naked, S.urls.effects]); assert.ok(sheetRow(retryHost, 'health')); retry.destroy();
});

console.log('\n== .186 optional loading inside the calculator ==');
const art = JSON.parse(fs.readFileSync(path.join(folder, 'art.json'), 'utf8'));
function calculatorRealm() {
  const browserModule = { exports: {} }, reads = [];
  vm.runInNewContext(calculatorSource, {
    module: browserModule, setTimeout, clearTimeout, location: { origin: 'https://guild.example', pathname: '/' }, navigator: {},
    fetch: async (url, options) => { reads.push([url, options && options.credentials]); return { ok: true, json: async () => clone(url.endsWith('/art.json') ? art : data) }; }
  }, { filename: path.join(folder, 'calculator.js'), timeout: 1000 });
  return { api: browserModule.exports, reads };
}
const sheetFetch = (urls, failNaked = false) => async url => { urls.push(url); if (failNaked && url.endsWith('naked60-186.json')) return { ok: false }; return { ok: true, json: async () => clone(url.endsWith('naked60-186.json') ? naked : effects) }; };
check('without a sheet module the calculator renders exactly as before: no sheet host and only its two reads', async () => {
  const { api, reads } = calculatorRealm(), document = makeDocument(), container = document.createElement('main');
  const controller = await api.mount(container, { className: 'paladin' });
  assert.equal(byClass(container, 'talents-stats60-host').length, 0); assert.deepEqual(reads.map(r => r[0]), ['/static/talents/data.json', '/static/talents/art.json']);
  controller.destroy();
});
check('a failing sheet loader leaves the calculator working and reports a retryable alert', async () => {
  const { api } = calculatorRealm(), document = makeDocument(), container = document.createElement('main'), changes = [];
  let calls = 0;
  const controller = await api.mount(container, { className: 'warrior', onBuildChange: value => changes.push(value), loadStats60: () => { calls++; return Promise.reject(Error('script error')); } });
  const host = byClass(container, 'talents-stats60-host')[0]; assert.ok(host); assert.equal(calls, 0);
  host.open = true; host.dispatch('toggle'); await settle();
  assert.equal(calls, 1); assert.match(host.textContent, /could not be loaded\. The talent calculator still works/);
  byClass(container, 'talents-pick')[0].click(); assert.equal(changes.at(-1).points, 1);
  host.open = false; host.dispatch('toggle'); host.open = true; host.dispatch('toggle'); await settle();
  assert.equal(calls, 2);
  // A loader that resolves to something without mount() is refused by the calculator's own guard, inside the section.
  const brokenMain = document.createElement('main'), brokenChanges = [];
  const broken = await api.mount(brokenMain, { className: 'mage', onBuildChange: value => brokenChanges.push(value), loadStats60: async () => ({ notMount: true }) });
  const brokenHost = byClass(brokenMain, 'talents-stats60-host')[0]; brokenHost.open = true; brokenHost.dispatch('toggle'); await settle();
  const alert = brokenHost.all(n => n.getAttribute('role') === 'alert')[0];
  assert.ok(alert); assert.match(alert.textContent, /could not be loaded\. The talent calculator still works/); assert.equal(byClass(brokenHost, 'talents-stats60').length, 0);
  byClass(brokenMain, 'talents-pick')[0].click(); assert.equal(brokenChanges.at(-1).points, 1);
  broken.destroy(); controller.destroy();
});
check('.189: a settled loader that resolves to no module (the app.js result) reports the alert and is asked again on the next opening', async () => {
  const { api } = calculatorRealm(), document = makeDocument(), container = document.createElement('main'), changes = [];
  let calls = 0;
  const controller = await api.mount(container, { className: 'hunter', onBuildChange: value => changes.push(value), loadStats60: async () => { calls++; return undefined; } });
  const host = byClass(container, 'talents-stats60-host')[0]; assert.ok(host); assert.equal(calls, 0);
  host.open = true; host.dispatch('toggle'); await settle();
  assert.equal(calls, 1);
  const alert = host.all(n => n.getAttribute('role') === 'alert')[0];
  assert.ok(alert); assert.match(alert.textContent, /could not be loaded\. The talent calculator still works/); assert.equal(byClass(host, 'talents-stats60').length, 0);
  byClass(container, 'talents-pick')[0].click(); assert.equal(changes.at(-1).points, 1);
  host.open = false; host.dispatch('toggle'); host.open = true; host.dispatch('toggle'); await settle();
  assert.equal(calls, 2);
  const again = host.all(n => n.getAttribute('role') === 'alert');
  assert.equal(again.length, 1); assert.match(again[0].textContent, /could not be loaded\. The talent calculator still works/); assert.equal(byClass(host, 'talents-stats60').length, 0);
  controller.destroy();
});
check('a sheet whose data request failed is replaced when the section is closed and reopened, so the retry really happens', async () => {
  const { api } = calculatorRealm(), document = makeDocument(), container = document.createElement('main'), urls = [];
  let failures = 1;
  const fetchOnceFailing = async url => { urls.push(url); if (failures > 0 && url.endsWith('naked60-186.json')) { failures--; return { ok: false }; } return { ok: true, json: async () => clone(url.endsWith('naked60-186.json') ? naked : effects) }; };
  const module = { mount: (node, ctx) => S.mount(node, { ...ctx, fetch: fetchOnceFailing }) };
  const controller = await api.mount(container, { className: 'priest', loadStats60: async () => module });
  const host = byClass(container, 'talents-stats60-host')[0]; host.open = true; host.dispatch('toggle'); await settle(10);
  assert.match(host.textContent, /level-60 data could not be loaded/); assert.equal(sheetRow(host, 'health'), undefined);
  const before = urls.length;
  host.open = false; host.dispatch('toggle'); host.open = true; host.dispatch('toggle'); await settle(10);
  assert.ok(urls.length > before); assert.ok(sheetRow(host, 'health')); assert.ok(!/could not be loaded/.test(host.textContent)); assert.equal(byClass(container, 'talents-stats60').length, 1);
  controller.destroy();
});
check('a collapsed sheet is not repainted on point edits and catches up when reopened', async () => {
  const { api } = calculatorRealm(), document = makeDocument(), container = document.createElement('main'), urls = [];
  const module = { mount: (node, ctx) => S.mount(node, { ...ctx, fetch: sheetFetch(urls) }) };
  const controller = await api.mount(container, { className: 'paladin', stats60: module });
  const host = byClass(container, 'talents-stats60-host')[0]; host.open = true; host.dispatch('toggle'); await settle(10);
  const contrib = byClass(host, 's60-contrib')[0], first = contrib.childNodes[0];
  host.open = false; host.dispatch('toggle');
  const pick = byClass(container, 'talents-pick').find(b => b.getAttribute('aria-label').startsWith('Divine Strength, rank'));
  pick.click(); pick.click();
  assert.equal(contrib.childNodes[0], first); assert.equal(cellValue(sheetRow(host, 'str'), 3), '105');
  host.open = true; host.dispatch('toggle'); await settle();
  assert.notEqual(contrib.childNodes[0], first); assert.ok(close(Number(cellValue(sheetRow(host, 'str'), 3)), 109.2));
  controller.destroy();
});
check('a loaded sheet whose data request fails reports inside its section while the calculator keeps allocating', async () => {
  const { api } = calculatorRealm(), document = makeDocument(), container = document.createElement('main'), urls = [], changes = [];
  const module = { mount: (node, ctx) => S.mount(node, { ...ctx, fetch: sheetFetch(urls, true) }) };
  const controller = await api.mount(container, { className: 'priest', onBuildChange: value => changes.push(value), loadStats60: async () => module });
  const host = byClass(container, 'talents-stats60-host')[0]; host.open = true; host.dispatch('toggle'); await settle(10);
  assert.match(host.textContent, /level-60 sheet is unavailable; the talent calculator is not affected/);
  byClass(container, 'talents-pick')[0].click(); assert.equal(changes.at(-1).points, 1);
  controller.destroy();
});
check('an opened sheet follows point edits in place, keeps its open state across a class change and is destroyed with the calculator', async () => {
  const { api } = calculatorRealm(), document = makeDocument(), container = document.createElement('main'), urls = [];
  const mounts = [];
  const module = { mount: (node, ctx) => { const view = S.mount(node, { ...ctx, fetch: sheetFetch(urls) }); mounts.push({ node, view, ctx }); return view; } };
  const controller = await api.mount(container, { className: 'paladin', stats60: module, guideBuilds: clone(guideData) });
  const host = byClass(container, 'talents-stats60-host')[0]; host.open = true; host.dispatch('toggle'); await settle(10);
  assert.equal(mounts.length, 1); assert.equal(mounts[0].ctx.guides.length, guideData.records.filter(r => r.className === 'paladin').length);
  const healthRow = sheetRow(host, 'health'); assert.ok(healthRow); assert.equal(cellValue(healthRow, 3), '2201');
  const pick = byClass(container, 'talents-pick').find(b => b.getAttribute('aria-label').startsWith('Divine Strength, rank'));
  for (let i = 0; i < 5; i++) pick.click();
  assert.equal(sheetRow(host, 'health'), healthRow); assert.ok(close(Number(cellValue(sheetRow(host, 'str'), 3)), 115.5));
  byClass(container, 'talents-class-button').find(b => b.textContent === 'Druid').click(); await settle(10);
  const druidHost = byClass(container, 'talents-stats60-host')[0];
  assert.equal(mounts.length, 2); assert.equal(druidHost.open, true); assert.ok(sheetRow(druidHost, 'meleeAP')); assert.equal(byClass(container, 'talents-stats60').length, 1);
  controller.destroy(); assert.equal(byClass(container, 'talents-stats60').length, 0);
  assert.deepEqual([...new Set(urls)].sort(), ['/static/talents/naked60-186.json', '/static/talents/stat-effects186.json']);
});

console.log('\n== .196 item 9b: compare specs, stat impact by talent, all classes ==');
const SPIRIT_WEAPONS = 'shaman-enhancement-spirit-weapons';
const statTalentIds = (cls, tree) => tree.talents.filter(t => effects.components.some(c => c.talentId === t.id && c.cls === cls) || t.id === SPIRIT_WEAPONS).map(t => t.id);
check('.196 tree check: all 27 trees list exactly their stat talents and need the provable minimum, and that allocation passes the calculator\'s own rules', () => {
  let trees = 0;
  for (const cls of data.classes) {
    const overview = S.specOverview(model, cls.id), all = talentsOf(cls.id);
    assert.deepEqual(overview.map(t => [t.id, t.name, t.budget]), cls.trees.map(t => [t.id, t.name, 51]));
    for (const [i, tree] of cls.trees.entries()) {
      const t = overview[i], expected = statTalentIds(cls.id, tree), byId = new Map(tree.talents.map(x => [x.id, x])); trees++;
      assert.deepEqual(t.talents.map(x => x.id), expected, tree.id); assert.ok(expected.length > 0, tree.id);
      assert.deepEqual(t.talents.map(x => [x.row, x.maxRank, x.pointsNeeded]), expected.map(id => [byId.get(id).row, byId.get(id).maxRank, 5 * (byId.get(id).row - 1)]), tree.id);
      // Independent closure and lower bound: every row r holding a needed talent needs 5 x (r - 1) earlier points, and extra points can
      // only add to those counts, so the largest shortfall is a lower bound; an allocation that reaches it is the minimum.
      const needed = new Set(expected);
      for (const id of expected) for (let p = byId.get(id).requires; p; p = byId.get(p).requires) needed.add(p);
      const points = ids => ids.reduce((s, id) => s + byId.get(id).maxRank, 0), total = points([...needed]);
      const shortfall = Math.max(0, ...[...needed].map(id => byId.get(id).row).map(r => 5 * (r - 1) - points([...needed].filter(id => byId.get(id).row < r))));
      assert.equal(t.statPoints, points(expected), tree.id); assert.equal(t.prerequisitePoints, total - t.statPoints, tree.id);
      assert.deepEqual(t.prerequisites.map(p => p.id), [...needed].filter(id => !expected.includes(id)).sort((a, b) => tree.talents.findIndex(x => x.id === a) - tree.talents.findIndex(x => x.id === b)), tree.id);
      assert.equal(t.legal, true, tree.id); assert.equal(t.minimum, total + shortfall, tree.id); assert.equal(t.fillerPoints, t.minimum - total, tree.id);
      assert.equal(t.reachable, t.minimum <= 51, tree.id); assert.equal(t.witnessRanks.reduce((a, b) => a + b, 0), t.minimum, tree.id);
      const verdict = C.validateBuild(data, { className: cls.id, level: 60, ranks: t.witnessRanks });
      assert.ok(verdict.ok, tree.id + ': ' + verdict.error); assert.deepEqual(verdict.treePoints.map((p, k) => k === i ? p : 0), verdict.treePoints, tree.id);
      for (const id of needed) assert.equal(t.witnessRanks[all.findIndex(x => x.id === id)], byId.get(id).maxRank, id);
      assert.deepEqual(t.upperRanks, all.map(x => expected.includes(x.id) ? x.maxRank : 0), tree.id);
    }
  }
  assert.equal(trees, 27);
  // Hand-checked against data.json: Holy needs Holy Shock (Divine Precision's prerequisite) and 25 points below Holy Power's row 6.
  const pick = (cls, tree) => S.specOverview(model, cls).find(t => t.id === tree), fields = t => [t.talents.length, t.statPoints, t.prerequisites.map(p => p.name), t.prerequisitePoints, t.fillerPoints, t.minimum, t.reachable];
  assert.deepEqual(fields(pick('paladin', 'holy')), [6, 24, ['Holy Shock'], 1, 5, 30, true]);
  assert.deepEqual(fields(pick('warrior', 'protection')), [3, 15, [], 0, 15, 30, true]);
  assert.deepEqual(fields(pick('mage', 'frost')), [4, 15, [], 0, 0, 15, true]);
  assert.deepEqual(fields(pick('shaman', 'enhancement')), [9, 32, [], 0, 0, 32, true]);
  // Retribution: Vengeance (row 5) needs 20 earlier points while only 16 are fixed below it, so 4 extra points, not the 3 that Champion of the Light's row 6 alone would need.
  assert.deepEqual(fields(pick('paladin', 'retribution')), [6, 22, ['Sanctified Judgement'], 3, 4, 29, true]);
  assert.ok(pick('shaman', 'enhancement').talents.some(t => t.id === SPIRIT_WEAPONS));
});
check('.196 tree check fails closed on synthetic trees: too few lower-row points is not legal, more than 51 points is not reachable, prerequisites and lowest-row filler are exact', () => {
  const t = (id, row, column, maxRank, requires = null) => ({ id, name: id, row, column, maxRank, requires });
  const thin = S.treeRequirement({ talents: [t('a', 1, 1, 2), t('b', 3, 1, 5)] }, ['b']);
  assert.deepEqual([thin.legal, thin.minimum, thin.fillerPoints, thin.reachable], [false, null, null, false]);
  const heavy = S.treeRequirement({ talents: [1, 2, 3, 4, 5, 6].map(row => t('r' + row, row, 1, 9)) }, ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
  assert.deepEqual([heavy.legal, heavy.statPoints, heavy.fillerPoints, heavy.minimum, heavy.reachable], [true, 54, 0, 54, false]);
  // c (row 3) needs p (row 2) at maximum rank: p needs 5 points in row 1 and c needs 10 below it, so 7 filler points go to row 1.
  const chain = S.treeRequirement({ talents: [t('f1', 1, 1, 5), t('f2', 1, 2, 5), t('p', 2, 1, 3), t('c', 3, 1, 1, 'p')] }, ['c']);
  assert.deepEqual([chain.statPoints, chain.prerequisites.map(p => p.id), chain.prerequisitePoints, chain.fillerPoints, chain.minimum, chain.reachable], [1, ['p'], 3, 7, 11, true]);
  assert.deepEqual(['f1', 'f2', 'p', 'c'].map(id => chain.ranks.get(id)), [5, 2, 3, 1]);
  // A filler talent with a prerequisite is used only after that prerequisite is at maximum rank.
  const locked = S.treeRequirement({ talents: [t('q', 1, 2, 2), t('d', 1, 1, 5, 'q'), t('top', 2, 1, 1)] }, ['top']);
  assert.deepEqual(['q', 'd', 'top'].map(id => locked.ranks.get(id)), [2, 3, 1]); assert.equal(locked.minimum, 6);
  const none = S.treeRequirement({ talents: [t('a', 1, 1, 3)] }, []); assert.deepEqual([none.minimum, none.reachable, none.statPoints], [0, true, 0]);
  // The budget boundary itself: exactly 51 points is reachable, 52 is not (no real tree needs exactly 51 in this snapshot).
  assert.equal(S.pointsAt60, 51);
  const edge = S.treeRequirement({ talents: [t('x', 1, 1, 51)] }, ['x']), over = S.treeRequirement({ talents: [t('x', 1, 1, 52)] }, ['x']);
  assert.deepEqual([edge.legal, edge.minimum, edge.reachable, over.legal, over.minimum, over.reachable], [true, 51, true, true, 52, false]);
  // The same boundary reached through filler points: a row-5 talent needs 20 earlier points, so 31 + 20 filler = 51.
  const filled = S.treeRequirement({ talents: [t('f', 1, 1, 25), t('top', 5, 1, 31)] }, ['top']), overFilled = S.treeRequirement({ talents: [t('f', 1, 1, 25), t('top', 5, 1, 32)] }, ['top']);
  assert.deepEqual([filled.fillerPoints, filled.minimum, filled.reachable, overFilled.minimum, overFilled.reachable], [20, 51, true, 52, false]);
});
check('.196 tree upper bound: one tree\'s stat talents at maximum rank through the sheet evaluator, labelled beside the checked guide builds of that tree', () => {
  const pal = S.specComparison(model, { className: 'paladin', race: 'human', guides: guidesFor('paladin') }), [holy, prot, ret] = pal.trees, total = (o, id) => o.sheets.total[id];
  assert.equal(pal.race, 'human'); assert.deepEqual(pal.trees.map(t => Array.from(t.guides, g => g.id)), [[], [], ['paladin-method-1']]);
  assert.ok(close(total(holy.outcome, 'str').value, 115.5)); assert.equal(total(holy.outcome, 'int').value, 77); assert.equal(total(holy.outcome, 'mana').value, 2387); assert.equal(total(holy.outcome, 'int').grade, 'E');
  assert.equal(total(holy.outcome, 'regenCasting').value, 30); assert.equal(total(holy.outcome, 'regenCasting').grade, 'A');
  assert.equal(total(prot.outcome, 'hitMelee').value, 3); assert.equal(total(prot.outcome, 'hitMelee').grade, 'A'); assert.equal(total(prot.outcome, 'defense').value, 320); assert.equal(total(prot.outcome, 'health').value, 2241);
  assert.equal(total(ret.outcome, 'parry').value, 10); assert.ok(close(total(ret.outcome, 'meleeCrit').value, 10.25)); assert.ok(close(total(ret.outcome, 'spellDamage').value, 21));
  // The bound is the same evaluation as those ranks on the sheet.
  for (const tree of pal.trees) { const direct = S.evaluate(model, { className: 'paladin', race: 'human', ranks: tree.upperRanks, totalsOnly: true }); for (const spec of pal.specs) assert.deepEqual(total(tree.outcome, spec.id), direct.sheets.total[spec.id], tree.id + ' ' + spec.id); }
  const spec = id => pal.specs.find(s => s.id === id);
  assert.deepEqual(S.compareText(total(prot.outcome, 'hitMelee'), total(pal.none, 'hitMelee'), spec('hitMelee')), { text: '3% (+3 pp)', grade: 'A', change: { text: '+3 pp', grade: 'A' } });
  assert.deepEqual(S.compareText(total(holy.outcome, 'int'), total(pal.none, 'int'), spec('int')), { text: '77 (+7)', grade: 'E', change: { text: '+7', grade: 'E' } });
  assert.deepEqual(S.compareText(total(pal.none, 'agi'), total(pal.none, 'agi'), spec('agi')), { text: '65', grade: 'E', change: { text: '—', grade: null } });
  // Unavailable totals: the change stays in modifier terms with the modifier grade (E once two talents stack), never a number on a missing base.
  const sky = S.specComparison(model, { className: 'druid', race: 'skyborne-windshaper' }), feral = sky.trees[1], sspec = id => sky.specs.find(s => s.id === id);
  assert.equal(total(feral.outcome, 'int').value, null); assert.equal(total(feral.outcome, 'int').grade, 'U');
  assert.deepEqual(S.compareText(total(feral.outcome, 'int'), total(sky.none, 'int'), sspec('int')), { text: 'Unavailable (+10% (modifier; total unavailable))', grade: 'U', change: { text: '+10% (modifier; total unavailable)', grade: 'A' } });
  assert.deepEqual(S.compareText(total(feral.outcome, 'dodge'), total(sky.none, 'dodge'), sspec('dodge')).change, { text: '+9 pp (modifier; total unavailable)', grade: 'E' });
  // Spirit Weapons is part of the Enhancement bound, so Shaman parry becomes Unavailable there instead of a guess.
  const sham = S.specComparison(model, { className: 'shaman', race: 'orc' });
  assert.deepEqual(S.compareText(total(sham.trees[1].outcome, 'parry'), total(sham.none, 'parry'), sham.specs.find(s => s.id === 'parry')), { text: 'Unavailable (change Unavailable)', grade: 'U', change: { text: 'Unavailable', grade: 'U' } });
  // Assumptions are honoured: with a hypothetical shield, the Protection bound adds Shield Specialization and Anticipation's defense.
  const shield = S.specComparison(model, { className: 'warrior', race: 'human', toggles: { shield: true } });
  assert.deepEqual(S.compareText(total(shield.trees[2].outcome, 'block'), total(shield.none, 'block'), shield.specs.find(s => s.id === 'block')), { text: '10.8% (+5.8 pp)', grade: 'E', change: { text: '+5.8 pp', grade: 'E' } });
  assert.throws(() => S.specComparison(model, { className: 'monk' }), /Unknown character class/);
  // A guide build stands beside every tree that holds most of its points (both on a tie); an empty, foreign or malformed one beside none.
  const warrior = talentsOf('warrior'), arms = data.classes.find(c => c.id === 'warrior').trees[0].talents.length, at = (index, rank) => warrior.map((_, i) => i === index ? rank : 0);
  const fake = (id, ranks, className = 'warrior') => ({ id, label: id, build: { className, ranks } });
  const tie = at(0, 3).map((r, i) => i === arms ? 3 : r), placed = S.specOverview(model, 'warrior', [fake('tie', tie), fake('arms', at(0, 3)), fake('empty', at(0, 0)), fake('short', [1]), fake('mage', at(0, 3), 'mage'), null]);
  assert.deepEqual(placed.map(t => Array.from(t.guides, g => [g.id, g.tied])), [[['tie', true], ['arms', false]], [['tie', true]], []]);
});
check('.196 all classes: one naked row per class for the race, equal to the sheet\'s no-talent totals; Unavailable stays U and absent classes are marked', () => {
  const human = S.classTable(model, 'human');
  assert.deepEqual(human.rows.map(r => r.className), ['warrior', 'paladin', 'hunter', 'rogue', 'priest', 'shaman', 'mage', 'warlock', 'druid']);
  assert.deepEqual(human.rows.filter(r => !r.available).map(r => r.className), ['shaman', 'druid']); assert.ok(human.rows.filter(r => !r.available).every(r => r.cells === null && r.grade === null));
  assert.equal(S.classColumns.length, 18);
  for (const race of Object.keys(naked.races)) for (const r of S.classTable(model, race).rows.filter(x => x.available)) {
    const sheet = S.evaluate(model, { className: r.className, race, ranks: ranksFor(r.className, []) });
    assert.equal(r.grade, sheet.combo.baseStats.grade);
    for (const col of S.classColumns) {
      const entry = r.cells[col.id], sheetRow = row(sheet, col.id);
      if (!sheetRow) { assert.equal(entry, null, race + ' ' + r.className + ' ' + col.id); continue; }
      assert.deepEqual(S.cellText(entry.cell, entry.spec), S.cellText(sheetRow.total, sheetRow), race + ' ' + r.className + ' ' + col.id);
    }
  }
  const cell = (table, cls, id) => { const r = table.rows.find(x => x.className === cls), e = r.cells[id]; return e ? S.cellText(e.cell, e.spec) : null; };
  assert.deepEqual(cell(human, 'paladin', 'health'), { text: '2201', grade: 'E' }); assert.deepEqual(cell(human, 'paladin', 'mana'), { text: '2282', grade: 'E' });
  assert.deepEqual(cell(human, 'paladin', 'meleeCrit'), { text: '5.25%', grade: 'E' }); assert.equal(cell(human, 'warrior', 'mana'), null); assert.deepEqual(cell(human, 'rogue', 'power'), { text: '100', grade: 'E' });
  assert.deepEqual(cell(human, 'mage', 'block'), { text: 'n/a', grade: null }); assert.deepEqual(cell(human, 'hunter', 'str'), { text: '55', grade: 'D' });
  assert.deepEqual(cell(S.classTable(model, 'tauren'), 'warrior', 'health'), { text: '2760', grade: 'E' });
  const sky = S.classTable(model, 'skyborne-high-order');
  assert.deepEqual(sky.rows.filter(r => r.available).map(r => r.className), ['warrior', 'hunter', 'rogue', 'mage', 'druid']);
  for (const r of sky.rows.filter(x => x.available)) {
    assert.equal(r.grade, 'U');
    for (const id of ['str', 'agi', 'sta', 'int', 'spi', 'health', 'armor', 'meleeAP', 'rangedAP', 'meleeCrit', 'spellCrit', 'dodge']) { assert.deepEqual(cell(sky, r.className, id), { text: 'Unavailable', grade: 'U' }, r.className + ' ' + id); assert.equal(r.cells[id].cell.value, null); }
  }
  assert.throws(() => S.classTable(model, 'pandaren'), /Unknown race/); assert.throws(() => S.classTable(model, 'constructor'), /Unknown race/);
});
check('.196 stat impact: every stat component of every class, at maximum rank and alone, with exact modifiers, graded sheet changes and modifier terms on Unavailable bases', () => {
  for (const cls of data.classes) {
    const result = S.impactRows(model, { className: cls.id, race: S.combosFor(model, cls.id)[0].race }), comps = effects.components.filter(c => c.cls === cls.id);
    assert.deepEqual(result.rows.map(r => r.id).sort(), [...comps.map(c => c.id), ...(cls.id === 'shaman' ? [SPIRIT_WEAPONS + '#parry_grant'] : [])].sort(), cls.id);
    for (const r of result.rows) {
      const tree = cls.trees[r.treeIndex], talent = tree.talents.find(t => t.id === r.talentId), comp = comps.find(c => c.id === r.id); assert.ok(talent, r.id); assert.equal(r.row, talent.row); assert.equal(r.pointsNeeded, 5 * (talent.row - 1)); assert.equal(r.tree, tree.name);
      // Grade and maximum rank come from the data: the six B components stay B, and the parry grant is U.
      assert.equal(r.maxRank, talent.maxRank, r.id); assert.equal(r.grade, comp ? comp.grade : 'U', r.id);
    }
  }
  const pal = S.impactRows(model, { className: 'paladin', race: 'human' }).rows, find = (rows, id) => rows.find(r => r.id === id);
  const di = find(pal, 'paladin-holy-divine-intellect#intellect_pct');
  assert.deepEqual([di.tree, di.row, di.pointsNeeded, di.requires, di.stat, di.group, di.kind, di.perRank, di.atMax, di.maxValue, di.sortValue, di.grade], ['Holy', 1, 0, null, 'Intellect', 'applied', 'Added to the sheet', '2 / 4 / 6 / 8 / 10%', '+10% Intellect (total)', 10, 7, 'A']);
  assert.deepEqual(di.effects.map(e => [e.label, e.text, e.grade]), [['Intellect', '+7', 'E'], ['Mana', '+105', 'E'], ['Spell crit %', '+0.13 pp (both candidates)', 'E']]);
  const anticipation = find(pal, 'paladin-protection-anticipation#defense_skill');
  assert.deepEqual(anticipation.effects.map(e => [e.label, e.text, e.grade]), [['Dodge %', '+0.8 pp', 'E'], ['Parry %', '+0.8 pp', 'E'], ['Defense skill', '+20', 'A']]); assert.equal(anticipation.sortValue, 20);
  const precision = find(pal, 'paladin-holy-divine-precision#spell_school_hit_chance');
  assert.deepEqual([precision.group, precision.requires, precision.effects.length, precision.sortValue, precision.conditions], ['scoped', 'Holy Shock', 0, null, ['for Holy spells']]);
  const vigor = find(S.impactRows(model, { className: 'rogue', race: 'gnome' }).rows, 'rogue-assassination-vigor#max_energy');
  assert.deepEqual(vigor.effects.map(e => [e.label, e.text, e.grade, e.value]), [['Maximum energy', '+10 (modifier)', 'A', 10], ['Maximum energy on the sheet', '+11 after percentage bonuses and Classic rounding', 'E', 11]]);
  assert.deepEqual([vigor.perRank, vigor.atMax, vigor.sortValue], ['5 / 10 energy', '+10 maximum energy', 10]);
  const elf = S.impactRows(model, { className: 'druid', race: 'night-elf' }).rows, bear = find(elf, 'druid-feral-combat-heart-of-the-wild#stamina_pct_bear');
  assert.deepEqual([bear.group, bear.kind, bear.conditions], ['conditional', 'Conditional: added only when its assumption is on', ['in Bear Form or Dire Bear Form']]);
  assert.deepEqual(bear.effects.map(e => [e.label, e.text, e.grade]), [['Stamina', '+13.8', 'E'], ['Health', '+138', 'E']]);
  const skyHotw = find(S.impactRows(model, { className: 'druid', race: 'skyborne-windshaper' }).rows, 'druid-feral-combat-heart-of-the-wild#intellect_pct');
  assert.deepEqual(skyHotw.effects.map(e => [e.label, e.text, e.grade]), [['Intellect', '+10% (modifier; total unavailable)', 'A'], ['2 dependent totals', 'Unavailable (no base values)', 'U']]); assert.equal(skyHotw.sortValue, null);
  const grant = find(S.impactRows(model, { className: 'shaman', race: 'orc' }).rows, SPIRIT_WEAPONS + '#parry_grant');
  assert.deepEqual([grant.grade, grant.tree, grant.effects.map(e => [e.row, e.text, e.grade])], ['U', 'Enhancement', [['parry', 'Unavailable (value not published)', 'U']]]);
  const shield = find(S.impactRows(model, { className: 'warrior', race: 'human', toggles: { shield: true } }).rows, 'warrior-protection-shield-specialization#block_chance');
  assert.deepEqual([shield.group, shield.kind, shield.effects.map(e => e.text)], ['applied', 'Added to the sheet (your assumption is on)', ['+5 pp']]);
  assert.equal(find(S.impactRows(model, { className: 'warrior', race: 'human' }).rows, 'warrior-protection-shield-specialization#block_chance').group, 'gear');
  // A changed rank text withholds its number here too.
  const changed = clone(data); changed.classes.find(c => c.id === 'paladin').trees.flatMap(t => t.talents).find(t => t.id === 'paladin-holy-divine-intellect').descriptions[4] = 'Increases your total Intellect by 99%.';
  const withheld = find(S.impactRows(S.prepare(changed, naked, effects), { className: 'paladin', race: 'human' }).rows, 'paladin-holy-divine-intellect#intellect_pct');
  assert.deepEqual([withheld.group, withheld.maxValue, withheld.effects.length, withheld.sortValue], ['withheld', null, 0, null]);
});
check('.196 sorting is stable, keeps missing values last in both directions and orders disputed values by their lowest candidate', () => {
  const items = [{ k: 3, n: 'a' }, { k: null, n: 'b' }, { k: 1, n: 'c' }, { k: 3, n: 'd' }, { k: undefined, n: 'e' }, { k: 2, n: 'f' }, { k: NaN, n: 'g' }];
  assert.deepEqual(S.sortRows(items, i => i.k, 'ascending').map(i => i.n), ['c', 'f', 'a', 'd', 'b', 'e', 'g']);
  assert.deepEqual(S.sortRows(items, i => i.k, 'descending').map(i => i.n), ['a', 'd', 'f', 'c', 'b', 'e', 'g']);
  assert.deepEqual(S.sortRows(['Warrior', 'Druid', 'Mage'], s => s, 'ascending'), ['Druid', 'Mage', 'Warrior']); assert.deepEqual(items.map(i => i.n).join(''), 'abcdefg');
  const human = S.classTable(model, 'human'), r = id => human.rows.find(x => x.className === id);
  assert.equal(S.classSortValue(r('paladin'), 'rangedAP'), 0); assert.equal(S.classSortValue(r('paladin'), 'class'), 'Paladin'); assert.equal(S.classSortValue(r('mage'), 'block'), null);
  assert.equal(S.classSortValue(r('druid'), 'health'), null); assert.equal(S.classSortValue(r('warrior'), 'mana'), null); assert.equal(S.classSortValue(r('warrior'), 'spellCrit'), null);
  const pal = S.impactRows(model, { className: 'paladin', race: 'human' }).rows;
  assert.deepEqual(S.sortRows(pal, x => S.impactSortValue(x, 'change'), 'descending').slice(0, 5).map(x => x.talentId), ['paladin-holy-reverence', 'paladin-retribution-champion-of-the-light', 'paladin-protection-anticipation', 'paladin-holy-divine-strength', 'paladin-holy-divine-intellect']);
  assert.deepEqual(S.sortRows(pal, x => S.impactSortValue(x, 'tree'), 'ascending').map(x => x.id), [...pal].sort((a, b) => a.treeIndex - b.treeIndex || a.index - b.index || pal.indexOf(a) - pal.indexOf(b)).map(x => x.id));
  assert.equal(S.impactSortValue(pal[0], 'grade'), 5); assert.equal(S.impactSortValue(pal[0], 'nonsense'), null);
});

const sectionTables = host => ({ check: byClass(host, 's60-tree-check')[0], specs: byClass(host, 's60-specs')[0], trees: byClass(host, 's60-tree-talents'), impact: byClass(host, 's60-impact')[0], classes: byClass(host, 's60-classes')[0] });
const bodyRows = table => table.all(n => n.tagName === 'TBODY')[0].children;
const sortButton = (table, label) => table.all(n => n.tagName === 'BUTTON' && n.children[0].textContent === label)[0];
check('.196 the three views render captioned tables with scoped headers, labelled focusable scroll regions, native sort buttons and no style attribute', async () => {
  const document = makeDocument(), host = document.createElement('div'), guides = guidesFor('warlock');
  const ui = S.mount(host, { data, build: C.emptyBuild(data, 'warlock', 60), naked, effects, guides }); assert.equal(await ui.ready, true);
  const headings = host.all(n => n.tagName === 'H3').map(n => n.textContent);
  assert.deepEqual(headings.slice(-3), ['Compare specs', 'Stat impact by talent', 'All classes']); assert.ok(headings.indexOf('Compare specs') > headings.indexOf('Spec comparison'));
  const t = sectionTables(host);
  assert.equal(t.trees.length, 3);
  for (const table of [t.check, t.specs, ...t.trees, t.impact, t.classes]) {
    assert.equal(table.tagName, 'TABLE'); assert.equal(table.getAttribute('role'), 'table'); assert.equal(table.children[0].tagName, 'CAPTION'); assert.ok(table.children[0].textContent.length > 20, table.className);
    const ths = table.all(n => n.tagName === 'TH'); assert.ok(ths.length > 3 && ths.every(th => ['col', 'row'].includes(th.getAttribute('scope'))), table.className);
  }
  for (const table of [t.impact, t.classes]) {
    const wrap = table.parentNode; assert.equal(wrap.className, 'table-wrap'); assert.equal(wrap.getAttribute('role'), 'region'); assert.equal(wrap.getAttribute('tabindex'), '0'); assert.match(wrap.getAttribute('aria-label'), /, scrollable table$/);
    const sortable = table.all(n => n.tagName === 'TH' && n.getAttribute('aria-sort') !== null);
    assert.ok(sortable.length >= 6); assert.equal(sortable.filter(th => th.getAttribute('aria-sort') === 'ascending').length, 1); assert.ok(sortable.every(th => ['ascending', 'none'].includes(th.getAttribute('aria-sort'))));
    assert.ok(sortable.every(th => th.children.length === 1 && th.children[0].tagName === 'BUTTON' && th.children[0].getAttribute('type') === 'button' && th.children[0].getAttribute('tabindex') === null && !th.children[0].disabled));
    assert.ok(sortable.every(th => th.children[0].all(n => n.getAttribute('aria-hidden') === 'true').length === 1));
  }
  for (const table of [t.check, t.specs, ...t.trees]) assert.equal(table.parentNode.className, 's60-table-wrap');
  // Warlock: one checked guide build per tree, each beside its tree; no guide column for the current build.
  const heads = t.specs.all(n => n.tagName === 'THEAD')[0].all(n => n.tagName === 'TH'), headLabel = th => th.children.length ? th.children[0].textContent : th.textContent;
  assert.deepEqual(heads.map(headLabel), ['Stat', 'No talents', 'Affliction: upper bound', guides[0].label, 'Demonology: upper bound', guides[1].label, 'Destruction: upper bound', guides[2].label]);
  // Short column notes keep narrow columns readable; the caption and the paragraph above carry the full honesty wording.
  assert.ok(heads.filter(th => headLabel(th).endsWith('upper bound')).every(th => /^All \d+ stat talents at maximum rank, \d+ points; reachable, minimum legal total \d+\. Not a build\.$/.test(byClass(th, 's60-row-note')[0].textContent)));
  assert.match(t.specs.children[0].textContent, /\(an upper bound only, not a recommended or checked build\)/);
  assert.deepEqual(bodyRows(t.check).map(tr => tr.children[7].textContent), Array.from(guides, g => g.label));
  assert.deepEqual(bodyRows(t.check).map(tr => tr.children[6].textContent), ['Yes', 'Yes', 'Yes']);
  // Guide columns use the same rule and values as the existing spec comparison table.
  const compareRows = byClass(host, 's60-compare')[0].all(n => n.tagName === 'TBODY')[0].children;
  for (const tr of bodyRows(t.specs)) { const id = tr.getAttribute('data-spec-row'), same = compareRows.find(x => x.children[0].textContent === tr.children[0].textContent); assert.ok(id && same, id); [3, 5, 7].forEach((col, g) => assert.equal(tr.children[col].textContent, same.children[3 + g].textContent, id)); }
  const rootText = byClass(host, 'talents-stats60')[0].textContent;
  assert.match(rootText, /in-game measurement protocol: not started/); assert.match(rootText, /not a recommended, checked or complete build/); assert.match(rootText, /A reachability check, not a recommendation\./);
  assert.ok(host.all(() => true).every(n => !('style' in n.attributes)));
  const textNodes = node => node.childNodes.flatMap(child => child instanceof FakeText ? [child] : textNodes(child));
  assert.ok(textNodes(host).every(x => x.data !== 'null' && x.data !== 'undefined' && !/NaN|\[object/.test(x.data)));
  ui.destroy();
});
check('.196 sort buttons (keyboard-operable native buttons) reorder the same rows, flip direction on a second activation and keep aria-sort on one header', async () => {
  const document = makeDocument(), host = document.createElement('div'), ui = S.mount(host, { data, build: C.emptyBuild(data, 'paladin', 60), naked, effects }); await ui.ready;
  const { classes, impact } = sectionTables(host), order = () => bodyRows(classes).map(tr => tr.getAttribute('data-class'));
  assert.deepEqual(order(), ['druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior']);
  assert.equal(bodyRows(classes).find(tr => tr.getAttribute('data-class') === 'shaman').children[1].textContent, 'Not available for this race');
  assert.equal(bodyRows(classes).find(tr => tr.getAttribute('data-class') === 'shaman').children[1].getAttribute('colspan'), '18');
  const before = new Set(bodyRows(classes)), health = sortButton(classes, 'Health');
  health.focus(); assert.equal(document.activeElement, health); health.click();
  assert.equal(health.parentNode.getAttribute('aria-sort'), 'ascending'); assert.equal(sortButton(classes, 'Class').parentNode.getAttribute('aria-sort'), 'none'); assert.equal(health.children[1].textContent, '▲');
  // Classes the race cannot be have no value and stay last, in the standard class order.
  assert.deepEqual(order(), ['mage', 'priest', 'warlock', 'rogue', 'hunter', 'paladin', 'warrior', 'shaman', 'druid']);
  health.click(); assert.equal(health.parentNode.getAttribute('aria-sort'), 'descending'); assert.equal(health.children[1].textContent, '▼');
  assert.deepEqual(order(), ['warrior', 'paladin', 'hunter', 'rogue', 'warlock', 'priest', 'mage', 'shaman', 'druid']);
  assert.ok(bodyRows(classes).every(tr => before.has(tr)) && bodyRows(classes).length === 9);
  assert.equal(classes.all(n => ['ascending', 'descending'].includes(n.getAttribute('aria-sort'))).length, 1);
  const change = sortButton(impact, 'Change on the sheet, alone'); change.click(); change.click();
  assert.deepEqual(bodyRows(impact).slice(0, 3).map(tr => tr.getAttribute('data-component')), ['paladin-holy-reverence#mana_regen_while_casting', 'paladin-retribution-champion-of-the-light#spell_damage_from_intellect', 'paladin-protection-anticipation#defense_skill']);
  assert.equal(bodyRows(impact).at(-1).children[6].textContent, 'Not added to the sheet');
  assert.equal(sortButton(impact, 'Tree').parentNode.getAttribute('aria-sort'), 'none');
  sortButton(impact, 'Talent').click(); assert.equal(bodyRows(impact)[0].children[0].textContent, 'Anticipation');
  ui.destroy();
});
check('.196 views follow race and assumption changes, keep their nodes across point edits, and the all-classes race is independent of the sheet race', async () => {
  const document = makeDocument(), host = document.createElement('div'), guides = guidesFor('warrior');
  const ui = S.mount(host, { data, build: C.emptyBuild(data, 'warrior', 60), naked, effects, guides }); await ui.ready;
  let t = sectionTables(host);
  const firstImpact = bodyRows(t.impact)[0], firstTree = bodyRows(t.trees[0])[0], firstClass = bodyRows(t.classes)[0], specCell = bodyRows(t.specs)[0].children[1];
  assert.ok(firstImpact && firstTree && firstClass && specCell); // node identity below must not pass on undefined === undefined
  ui.update(legalBuild('warrior', [['warrior-protection-shield-specialization', 5]])); ui.update(guides[0].build);
  assert.equal(bodyRows(t.impact)[0], firstImpact); assert.equal(bodyRows(t.trees[0])[0], firstTree); assert.equal(bodyRows(t.classes)[0], firstClass); assert.equal(bodyRows(t.specs)[0].children[1], specCell);
  assert.match(t.specs.children[0].textContent, /^Level 60 Human Warrior, no gear, nothing active/);
  const race = host.all(n => n.tagName === 'SELECT' && n.getAttribute('aria-label') === 'Race')[0]; race.value = 'skyborne-high-order'; race.dispatch('change');
  assert.match(t.specs.children[0].textContent, /^Level 60 Skyborne \(High Order\) Warrior/); assert.notEqual(bodyRows(t.impact)[0], firstImpact); assert.equal(bodyRows(t.classes)[0], firstClass);
  const strength = bodyRows(t.specs).find(tr => tr.getAttribute('data-spec-row') === 'str');
  assert.ok(strength.children.slice(1).every(td => /^Unavailable/.test(td.children[0].textContent) && td.all(n => n.tagName === 'ABBR')[0].textContent === 'U'));
  const parry = bodyRows(t.specs).find(tr => tr.getAttribute('data-spec-row') === 'parry'); assert.equal(parry.children[2].children[0].textContent, '10% (+5 pp)');
  const shield = host.all(n => n.tagName === 'INPUT' && n.getAttribute('type') === 'checkbox')[0]; shield.checked = true; shield.dispatch('change');
  assert.match(t.specs.children[0].textContent, /with your hypothetical assumptions/);
  const spec = bodyRows(t.impact).find(tr => tr.getAttribute('data-component') === 'warrior-protection-shield-specialization#block_chance'); assert.equal(spec.children[3].textContent, 'Added to the sheet (your assumption is on)');
  // The all-classes race has its own control; changing it leaves the sheet race alone.
  const allRace = host.all(n => n.tagName === 'SELECT' && n.getAttribute('aria-label') === 'Race for the all-classes table')[0];
  assert.equal(allRace.value, 'human'); assert.equal(allRace.children.length, 10); assert.equal(allRace.parentNode.children[0].textContent, 'Race for the all-classes table');
  allRace.value = 'tauren'; allRace.dispatch('change');
  assert.match(t.classes.children[0].textContent, /^Level 60 Tauren, every class/); assert.equal(race.value, 'skyborne-high-order');
  const warrior = bodyRows(t.classes).find(tr => tr.getAttribute('data-class') === 'warrior'); assert.equal(warrior.children[6].children[0].textContent, '2760'); assert.equal(warrior.children[6].all(n => n.tagName === 'ABBR')[0].textContent, 'E');
  assert.ok(warrior.children[6].className.includes('s60-ref'));
  allRace.value = 'skyborne-windshaper'; allRace.dispatch('change');
  for (const tr of bodyRows(t.classes).filter(x => x.children.length > 2)) { assert.equal(tr.children[1].children[0].textContent, 'Unavailable'); assert.equal(tr.children[1].all(n => n.tagName === 'ABBR')[0].textContent, 'U'); assert.ok(tr.children[1].className.includes('s60-unavailable')); }
  assert.deepEqual(bodyRows(t.classes).filter(x => x.children.length === 2).map(tr => tr.getAttribute('data-class')), ['mage', 'paladin', 'priest', 'warlock']);
  // A class change rebuilds the views but keeps the all-classes race and the sort orders.
  sortButton(t.classes, 'Health').click();
  ui.update(C.emptyBuild(data, 'priest', 60)); t = sectionTables(host);
  assert.equal(host.all(n => n.tagName === 'SELECT' && n.getAttribute('aria-label') === 'Race for the all-classes table')[0].value, 'skyborne-windshaper');
  assert.equal(sortButton(t.classes, 'Health').parentNode.getAttribute('aria-sort'), 'ascending');
  assert.deepEqual(bodyRows(t.check).map(tr => tr.children[7].textContent), ['None in this snapshot', 'None in this snapshot', 'None in this snapshot']);
  assert.ok(t.specs.all(n => n.tagName === 'THEAD')[0].all(n => n.tagName === 'TH').filter(th => /upper bound/.test(th.textContent)).every(th => /No checked guide build for this tree\./.test(th.textContent)));
  ui.destroy();
});
check('.196 a Skyborne upper bound shows the change in modifier terms with its own grade in the cell note, and the views request nothing beyond the two data files', async () => {
  const document = makeDocument(), host = document.createElement('div'), urls = [];
  const ui = S.mount(host, { data, build: C.emptyBuild(data, 'druid', 60), fetch: sheetFetch(urls), guides: guidesFor('druid') }); assert.equal(await ui.ready, true);
  const race = host.all(n => n.tagName === 'SELECT' && n.getAttribute('aria-label') === 'Race')[0]; race.value = 'skyborne-windshaper'; race.dispatch('change');
  const { specs, impact, classes } = sectionTables(host), feralColumn = specs.all(n => n.tagName === 'THEAD')[0].children[0].children.findIndex(th => th.textContent.startsWith('Feral Combat: upper bound'));
  const cellOf = id => bodyRows(specs).find(tr => tr.getAttribute('data-spec-row') === id).children[feralColumn];
  assert.equal(cellOf('int').children[0].textContent, 'Unavailable (+10% (modifier; total unavailable))'); assert.equal(cellOf('int').all(n => n.tagName === 'ABBR')[0].textContent, 'U');
  assert.equal(byClass(cellOf('int'), 's60-cell-note')[0].textContent, 'Change in modifier terms: grade A'); assert.equal(byClass(cellOf('dodge'), 's60-cell-note')[0].textContent, 'Change in modifier terms: grade E');
  const hotw = bodyRows(impact).find(tr => tr.getAttribute('data-component') === 'druid-feral-combat-heart-of-the-wild#intellect_pct');
  assert.match(hotw.children[6].textContent, /^Intellect \+10% \(modifier; total unavailable\) A2 dependent totals Unavailable \(no base values\) U$/);
  sortButton(classes, 'Spell crit %').click(); sortButton(impact, 'Data grade').click();
  const allRace = host.all(n => n.tagName === 'SELECT' && n.getAttribute('aria-label') === 'Race for the all-classes table')[0]; allRace.value = 'gnome'; allRace.dispatch('change');
  assert.deepEqual([...new Set(urls)].sort(), ['/static/talents/naked60-186.json', '/static/talents/stat-effects186.json']); assert.equal(urls.length, 2);
  ui.destroy();
});

// .196 review fixes: the rendered views are compared with the data, not only with the renderer's own helpers.
const selectNamed = (host, label) => host.all(n => n.tagName === 'SELECT' && n.getAttribute('aria-label') === label)[0];
const badgeOf = td => td.all(n => n.tagName === 'ABBR')[0];
const headCells = table => table.all(n => n.tagName === 'THEAD')[0].all(n => n.tagName === 'TH');
const mountFresh = async (cls, extra = {}) => { const document = makeDocument(), host = document.createElement('div'), ui = S.mount(host, { data, build: C.emptyBuild(data, cls, 60), naked, effects, ...extra }); assert.equal(await ui.ready, true); return { document, host, ui, t: sectionTables(host) }; };
// One read-only mount per class with its checked guide builds and default race; checks that click or switch use mountFresh.
let sharedMounts = null;
const classMounts = () => sharedMounts ||= Promise.all(data.classes.map(async cls => { const m = await mountFresh(cls.id, { guides: guidesFor(cls.id) }); return { cls, ...m, race: selectNamed(m.host, 'Race').value }; }));
check('.196 each tree table lists exactly that tree\'s stat components in talent order, with row, requirement, rank and grade from the data, for all nine classes', async () => {
  let total = 0, bGrades = 0;
  for (const { cls, t } of await classMounts()) {
    const overview = S.specOverview(model, cls.id);
    cls.trees.forEach((tree, i) => {
      const trs = bodyRows(t.trees[i]), ids = trs.map(tr => tr.getAttribute('data-component'));
      // Expected from the stat file and data.json alone: every component of the tree's talents in talent order, plus the parry grant.
      const expected = tree.talents.flatMap(tal => [...effects.components.filter(c => c.cls === cls.id && c.talentId === tal.id).map(c => c.id), ...(tal.id === SPIRIT_WEAPONS ? [SPIRIT_WEAPONS + '#parry_grant'] : [])]);
      assert.ok(trs.length > 0, tree.id); assert.deepEqual(ids, expected, tree.id); total += trs.length;
      assert.deepEqual([...new Set(ids.map(id => id.split('#')[0]))], overview[i].talents.map(x => x.id), tree.id);
      const talentIds = [...new Set(ids.map(id => id.split('#')[0]))], points = talentIds.reduce((s, id) => s + tree.talents.find(x => x.id === id).maxRank, 0);
      assert.equal(t.trees[i].children[0].textContent, tree.name + ': ' + talentIds.length + (talentIds.length === 1 ? ' talent' : ' talents') + ' with a stat component, ' + points + (points === 1 ? ' point' : ' points') + ' at maximum rank', tree.id);
      for (const tr of trs) {
        const id = tr.getAttribute('data-component'), tal = tree.talents.find(x => x.id === id.split('#')[0]), prior = tal.requires ? tree.talents.find(x => x.id === tal.requires).name : null;
        assert.equal(byClass(tr, 's60-row-note')[0].textContent, tal.maxRank + (tal.maxRank === 1 ? ' rank' : ' ranks'), id);
        assert.equal(tr.children[1].textContent, 'Row ' + tal.row + (tal.row > 1 ? ', ' + 5 * (tal.row - 1) + ' points in earlier rows' : ', no earlier points') + (prior ? '; requires ' + prior + ' at maximum rank' : ''), id);
        // Stat, kind, per-rank and maximum-rank text agree with the impact table's row for the same component.
        const twin = bodyRows(t.impact).find(x => x.getAttribute('data-component') === id), comp = effects.components.find(c => c.id === id), want = comp ? comp.grade : 'U';
        assert.deepEqual([2, 3, 4, 5].map(k => tr.children[k].textContent), [2, 3, 4, 5].map(k => twin.children[k].textContent), id);
        assert.equal(badgeOf(tr.children[6]).textContent, want, id); assert.equal(badgeOf(twin.children[7]).textContent, want, id);
        bGrades += (want === 'B') + (badgeOf(twin.children[7]).textContent === 'B');
      }
    });
  }
  // 141 components plus the Spirit Weapons parry grant; the six B components show B once in their tree table and once in the impact table.
  assert.equal(total, 142); assert.equal(bGrades, 12);
  const pal = (await classMounts()).find(m => m.cls.id === 'paladin').t;
  assert.equal(bodyRows(pal.trees[0]).find(tr => tr.getAttribute('data-component') === 'paladin-holy-divine-precision#spell_school_hit_chance').children[1].textContent, 'Row 5, 20 points in earlier rows; requires Holy Shock at maximum rank');
  assert.equal(bodyRows(pal.trees[0]).find(tr => tr.getAttribute('data-component') === 'paladin-holy-divine-intellect#intellect_pct').children[1].textContent, 'Row 1, no earlier points');
  assert.equal(byClass(bodyRows((await classMounts()).find(m => m.cls.id === 'shaman').t.trees[1]).find(tr => tr.getAttribute('data-component') === SPIRIT_WEAPONS + '#parry_grant'), 's60-row-note')[0].textContent, '1 rank');
});
check('.196 reachability cells show the tree check\'s own numbers, counts read in the singular for one, data-grade tooltips use the stat file\'s legend and no cell gets a numeric class', async () => {
  const one = /\b1 (stat )?talents\b|\b1 points\b|\b1 stat components\b/;
  for (const { cls, host, t } of await classMounts()) {
    const ov = S.specOverview(model, cls.id), rows = bodyRows(t.check);
    assert.deepEqual(rows.map(tr => tr.getAttribute('data-tree')), cls.trees.map(x => x.id));
    rows.forEach((tr, i) => assert.deepEqual([1, 2, 4, 5].map(k => tr.children[k].textContent), [ov[i].talents.length, ov[i].statPoints, ov[i].fillerPoints, ov[i].minimum].map(String), cls.id + ' ' + i));
    const texts = [...headCells(t.specs).map(th => th.textContent), ...t.trees.map(x => x.children[0].textContent), t.impact.children[0].textContent, ...rows.map(tr => tr.textContent)];
    assert.ok(texts.every(s => !one.test(s)), cls.id);
    // Data grades are talent components: the stat file names them (A: a DB2 trait curve equals the rank text), never an in-game measurement.
    for (const table of [...t.trees, t.impact]) for (const tr of bodyRows(table)) {
      const mark = badgeOf(tr.children.at(-1)), g = mark.textContent;
      assert.equal(mark.getAttribute('title'), 'Grade ' + g + ': ' + (effects.grades[g] || naked.grades.U.label), tr.getAttribute('data-component')); assert.ok(!/measurement/i.test(mark.getAttribute('title')));
    }
    assert.equal(naked.measurementProtocol.status, 'not started');
    // valueCell keeps only a class name string: no td anywhere carries a token that starts with a digit (an Array.map index).
    assert.ok(host.all(n => n.tagName === 'TD').every(td => td.className.split(/\s+/).every(token => !/^\d/.test(token))), cls.id);
  }
  const mounts = await classMounts(), pal = mounts.find(m => m.cls.id === 'paladin'), mage = mounts.find(m => m.cls.id === 'mage');
  assert.deepEqual(bodyRows(pal.t.check).map(tr => tr.children.slice(0, 7).map(c => c.textContent)), [['Holy', '6', '24', 'Holy Shock 1/1 (1 point)', '5', '30', 'Yes'], ['Protection', '7', '26', 'none', '0', '26', 'Yes'], ['Retribution', '6', '22', 'Sanctified Judgement 3/3 (3 points)', '4', '29', 'Yes']]);
  assert.match(pal.t.impact.children[0].textContent, /: 20 stat components in 19 talents, each at maximum rank and alone\.$/);
  // The existing sheet's cells are unchanged by the valueCell parameter: Base and Total greyed, Racial and Talents plain.
  assert.deepEqual(sheetRow(pal.host, 'str').children.slice(1).map(td => td.className), ['s60-cell s60-ref', 's60-cell', 's60-cell', 's60-cell s60-ref']);
  // Mage Fire has exactly one stat talent.
  const fire = headCells(mage.t.specs).find(th => th.children.length && th.children[0].textContent === 'Fire: upper bound');
  assert.match(byClass(fire, 's60-row-note')[0].textContent, /^The only stat talent at maximum rank, 5 points; reachable, minimum legal total 25\. Not a build\./);
  assert.equal(mage.t.trees[1].children[0].textContent, 'Fire: 1 talent with a stat component, 5 points at maximum rank');
});
check('.196 every all-classes cell for every race shows the model\'s own text and grade, a value a class lacks reads n/a without a badge, and each row names its base grade', async () => {
  const { host, ui, t } = await mountFresh('warrior'), allRace = selectNamed(host, 'Race for the all-classes table'), NOTE = { E: 'Base: Classic reference (E)', D: 'Base: estimate from Classic data (D)', U: 'Base: Unavailable (U)' };
  let cells = 0, missing = 0, disputed = 0;
  for (const race of Object.keys(naked.races)) {
    allRace.value = race; allRace.dispatch('change');
    for (const r of S.classTable(model, race).rows) {
      const tr = bodyRows(t.classes).find(x => x.getAttribute('data-class') === r.className);
      if (!r.available) { assert.deepEqual([tr.children.length, tr.children[1].textContent], [2, 'Not available for this race'], race + ' ' + r.className); continue; }
      assert.equal(byClass(tr.children[0], 's60-row-note')[0].textContent, NOTE[naked.combos.find(c => c.race === race && c.class === r.className).baseStats.grade], race + ' ' + r.className);
      S.classColumns.forEach((col, i) => {
        const e = r.cells[col.id], want = e ? S.cellText(e.cell, e.spec) : { text: 'n/a', grade: null }, td = tr.children[1 + i], mark = badgeOf(td), at = race + ' ' + r.className + ' ' + col.id;
        assert.equal(td.getAttribute('data-label'), col.label, at); assert.equal(td.children[0].textContent, want.text, at); assert.equal(mark.hidden ? null : mark.textContent, want.grade, at);
        if (!e) { missing++; assert.equal(mark.hidden, true, at); assert.equal(mark.textContent, '', at); assert.ok(!/s60-ref|s60-unavailable/.test(td.className), at); }
        if (e && e.cell.cands) { disputed++; assert.ok(td.className.split(' ').includes('wrap'), at); }
        cells++;
      });
    }
  }
  assert.equal(cells, 56 * 18); assert.ok(missing > 0 && disputed > 0);
  allRace.value = 'human'; allRace.dispatch('change');
  const warrior = bodyRows(t.classes).find(x => x.getAttribute('data-class') === 'warrior'), manaCell = warrior.children[1 + S.classColumns.findIndex(c => c.id === 'mana')];
  assert.equal(manaCell.children[0].textContent, 'n/a'); assert.equal(badgeOf(manaCell).hidden, true);
  ui.destroy();
});
check('.196 all-classes column labels are the sheet\'s own row labels (the melee crit value includes racial traits), except the shared power column', () => {
  for (const cls of data.classes) {
    const sheet = S.evaluate(model, { className: cls.id, race: S.combosFor(model, cls.id)[0].race, ranks: ranksFor(cls.id, []) });
    for (const col of S.classColumns.filter(c => c.id !== 'power')) { const spec = sheet.specs.find(s => s.id === col.id); if (spec) assert.equal(col.label, spec.label, cls.id + ' ' + col.id); }
  }
  assert.equal(S.classColumns.find(c => c.id === 'meleeCrit').label, 'Melee crit % (Agility part and modifiers)');
  // Human Paladin: 3.25% from Agility plus Ruthless +2 pp; Orc Warrior: Agility part plus Savage +1 pp.
  const human = S.classTable(model, 'human').rows.find(r => r.className === 'paladin').cells.meleeCrit.cell, orc = S.evaluate(model, { className: 'warrior', race: 'orc', ranks: ranksFor('warrior', []) });
  assert.equal(human.value, 5.25); assert.equal(S.classTable(model, 'orc').rows.find(r => r.className === 'warrior').cells.meleeCrit.cell.value, row(orc, 'meleeCrit').base.value + 1);
});
check('.196 the all-classes caption carries the data\'s own race and base notes (Gnome Intellect), whatever the sheet race and sort order', async () => {
  const gnome = naked.races.gnome.note; assert.match(gnome, /Gnome Intellect may be about 5% high for Forever/);
  const g = S.classTable(model, 'gnome'); assert.equal(g.note, gnome);
  assert.deepEqual(g.rows.filter(r => r.available).map(r => [r.className, r.note]), ['warrior', 'rogue', 'priest', 'mage', 'warlock'].map(c => [c, gnome]));
  assert.equal(S.classTable(model, 'human').note, null); assert.ok(S.classTable(model, 'human').rows.every(r => r.note === null));
  const { host, ui, t } = await mountFresh('mage'), race = selectNamed(host, 'Race'), allRace = selectNamed(host, 'Race for the all-classes table'), caption = () => t.classes.children[0].textContent;
  assert.equal(race.value, 'human'); assert.equal(allRace.value, 'human'); assert.equal(caption(), 'Level 60 Human, every class: no talents, no gear, no assumptions.');
  allRace.value = 'gnome'; allRace.dispatch('change');
  assert.equal(caption(), 'Level 60 Gnome, every class: no talents, no gear, no assumptions. ' + gnome); assert.equal(race.value, 'human');
  // Gnome Mage: Classic Intellect 133, and Mana with Expansive Mind's +5% on top, which is why the note is shown.
  const mage = bodyRows(t.classes).find(tr => tr.getAttribute('data-class') === 'mage'), col = id => 1 + S.classColumns.findIndex(c => c.id === id);
  assert.equal(mage.children[col('int')].children[0].textContent, '133'); assert.equal(mage.children[col('mana')].children[0].textContent, String(Math.round((1273 + 20 + 15 * 113) * 1.05)));
  sortButton(t.classes, 'Mana').click(); assert.equal(caption().split('about 5% high').length, 2);
  allRace.value = 'human'; allRace.dispatch('change'); assert.ok(!/about 5% high/.test(caption()));
  ui.destroy();
});
check('.196 a guide whose ranks cannot be evaluated stays beside its tree and reads Unavailable (U) in both comparison tables without breaking the sheet', async () => {
  const good = guidesFor('warlock')[0], broken = { id: 'broken-guide', label: 'Broken guide (test)', build: { ...good.build, ranks: good.build.ranks.map(r => r ? 99 : 0) } };
  const { host, ui, t } = await mountFresh('warlock', { guides: [broken] }), labelOf = th => th.children.length ? th.children[0].textContent : th.textContent;
  const labels = headCells(t.specs).map(labelOf), col = labels.indexOf('Broken guide (test)');
  assert.deepEqual(labels, ['Stat', 'No talents', 'Affliction: upper bound', 'Broken guide (test)', 'Demonology: upper bound', 'Destruction: upper bound']);
  const compare = byClass(host, 's60-compare')[0], compareCol = headCells(compare).map(labelOf).indexOf('Broken guide (test)');
  assert.ok(compareCol > 0);
  for (const td of [...bodyRows(t.specs).map(tr => tr.children[col]), ...bodyRows(compare).map(tr => tr.children[compareCol])]) {
    assert.equal(td.children[0].textContent, 'Unavailable'); assert.equal(badgeOf(td).hidden, false); assert.equal(badgeOf(td).textContent, 'U');
    assert.ok(td.className.split(' ').includes('s60-unavailable') && !td.className.includes('s60-ref'));
  }
  assert.equal(byClass(host, 's60-status')[0].hidden, true);
  ui.destroy();
});
check('.196 impact sort keys are the displayed fields, text sorts alphabetically ignoring case, and the Stat, Kind and At maximum rank headers order rows by them', async () => {
  for (const cls of data.classes) for (const r of S.impactRows(model, { className: cls.id, race: S.combosFor(model, cls.id)[0].race }).rows) {
    assert.deepEqual(['talent', 'stat', 'kind', 'max', 'change'].map(k => S.impactSortValue(r, k)), [r.name, r.stat, r.kind, r.maxValue, r.sortValue], r.id);
    assert.match(r.stat, /^[A-Z]/, r.id);
  }
  const pal = S.impactRows(model, { className: 'paladin', race: 'human' }).rows, di = pal.find(r => r.id === 'paladin-holy-divine-intellect#intellect_pct');
  assert.deepEqual(['max', 'kind', 'stat'].map(k => S.impactSortValue(di, k)), [10, 'Added to the sheet', 'Intellect']);
  assert.deepEqual(S.sortRows(['armor', 'Intellect', 'all resistances', 'Agility', 'Defense skill'], s => s, 'ascending'), ['Agility', 'all resistances', 'armor', 'Defense skill', 'Intellect']);
  assert.deepEqual(S.sortRows(['b', 'A', 'a', 'B'], s => s, 'ascending'), ['A', 'a', 'b', 'B']); // case-insensitive ties keep their order
  const mage = S.impactRows(model, { className: 'mage', race: 'human' }).rows.map(r => r.stat), sorted = S.sortRows(mage, s => s, 'ascending');
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i - 1].toLowerCase() <= sorted[i].toLowerCase() || /[^a-z ]/i.test(sorted[i - 1] + sorted[i]), sorted[i - 1] + ' / ' + sorted[i]);
  const { ui, t } = await mountFresh('paladin');
  for (const [label, field] of [['Stat', 'stat'], ['Kind', 'kind'], ['At maximum rank', 'maxValue']]) {
    const button = sortButton(t.impact, label); button.click();
    assert.equal(button.parentNode.getAttribute('aria-sort'), 'ascending', label);
    assert.deepEqual(bodyRows(t.impact).map(tr => tr.getAttribute('data-component')), S.sortRows(pal, r => r[field], 'ascending').map(r => r.id), label);
  }
  ui.destroy();
});
check('.196 a conditional or gear effect reads "Would add when its assumption holds" and loses that prefix once its assumption is on; Classic-reference parts are greyed', async () => {
  const druid = (await classMounts()).find(m => m.cls.id === 'druid'), cellOf = (t, id) => bodyRows(t.impact).find(tr => tr.getAttribute('data-component') === id).children[6];
  assert.equal(druid.race, 'night-elf');
  assert.match(cellOf(druid.t, 'druid-feral-combat-heart-of-the-wild#stamina_pct_bear').textContent, /^Would add when its assumption holds: Stamina \+13\.8 E/);
  assert.ok(!/Would add/.test(cellOf(druid.t, 'druid-feral-combat-heart-of-the-wild#intellect_pct').textContent));
  const { host, ui, t } = await mountFresh('warrior'), shieldId = 'warrior-protection-shield-specialization#block_chance';
  assert.equal(cellOf(t, shieldId).textContent, 'Would add when its assumption holds: Block % +5 pp A');
  const box = host.all(n => n.tagName === 'INPUT' && n.getAttribute('type') === 'checkbox')[0]; box.checked = true; box.dispatch('change');
  assert.equal(cellOf(t, shieldId).textContent, 'Block % +5 pp A');
  ui.destroy();
  // E and D parts carry s60-ref (greyed by the stylesheet); an exact talent part does not.
  const pal = (await classMounts()).find(m => m.cls.id === 'paladin').t, parts = id => byClass(cellOf(pal, id), 's60-effects').map(p => p.className);
  assert.deepEqual(parts('paladin-holy-divine-intellect#intellect_pct'), ['s60-effects s60-ref', 's60-effects s60-ref', 's60-effects s60-ref']);
  assert.deepEqual(parts('paladin-protection-anticipation#defense_skill'), ['s60-effects s60-ref', 's60-effects s60-ref', 's60-effects']);
});
check('.196 the disputed-change bracket drops its repeated "disputed:" prefix in both comparison tables', async () => {
  const priest = S.specComparison(model, { className: 'priest', race: 'human' }), spec = priest.specs.find(s => s.id === 'spellCrit');
  const text = 'disputed: 7.2% (CMaNGOS) · 5.23% (warcraft.wiki.gg) (+0.2 pp (CMaNGOS) · +0.18 pp (warcraft.wiki.gg))';
  assert.equal(S.compareText(priest.trees[0].outcome.sheets.total.spellCrit, priest.none.sheets.total.spellCrit, spec).text, text);
  const document = makeDocument(), host = document.createElement('div'), ui = S.mount(host, { data, build: legalBuild('priest', [['priest-discipline-mental-strength', 5]]), naked, effects }); assert.equal(await ui.ready, true);
  const rowOf = table => bodyRows(table).find(tr => tr.children[0].textContent === 'Spell crit %'), compare = byClass(host, 's60-compare')[0], specs = sectionTables(host).specs;
  assert.equal(rowOf(compare).children[2].children[0].textContent, text); // current build column
  assert.equal(rowOf(specs).children[2].children[0].textContent, text); // Discipline upper bound
  const textNodes = node => node.childNodes.flatMap(child => child instanceof FakeText ? [child] : textNodes(child));
  assert.ok(textNodes(host).every(x => !x.data.includes('(disputed: ')));
  ui.destroy();
});
check('.196 the stylesheet keeps the sortable tables\' captions in view, pins their row headers while they scroll sideways and greys Classic-reference effect parts', () => {
  for (const rule of ['.talents-stats60 .table-wrap{container-type:inline-size;scroll-padding-left:8.5rem}',
    '.talents-stats60 table.data caption{position:sticky;left:0;max-width:calc(100vw - 72px);max-width:100cqw;padding:6px 10px;text-align:left;font-size:12px;color:#d9cbab}',
    '.talents-stats60 table.data th{white-space:normal}',
    '.talents-stats60 table.data tbody th,.talents-stats60 table.data thead th:first-child{left:0;z-index:2;width:8rem;min-width:8rem;max-width:8rem;background:#19160e}',
    '.talents-stats60 table.data tbody th{z-index:1;text-transform:none;letter-spacing:normal}',
    '.talents-stats60 .s60-effects.s60-ref{color:#9e9b92;font-style:italic}']) assert.ok(css.includes(rule), rule);
  // Outside every media query, after the base .s60-effects colour, and scoped to the sheet (no site-wide table rule changes).
  const at = css.indexOf('.talents-stats60 .table-wrap{'); assert.ok(at > css.indexOf('.talents-stats60 .s60-effects{color:') && at < css.indexOf('@media(max-width:560px){'));
  assert.ok(!/(^|[}\n])table\.data|(^|[}\n])\.table-wrap/.test(css));
});

Promise.all(pending).then(() => {
  finished = true;
  const complete = passed + failed === registered;
  console.log('\n' + passed + ' passed, ' + failed + ' failed' + (complete ? '' : ', ' + (registered - passed - failed) + ' not run'));
  process.exitCode = failed || !complete ? 1 : 0;
});

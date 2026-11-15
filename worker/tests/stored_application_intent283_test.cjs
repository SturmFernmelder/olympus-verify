'use strict';
// Stored application descriptors are evidence, not permission to submit a new
// application. Exercise the real TypeScript parser and current office catalogue.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const loaded = new Map();
function load(name) {
  name = name.replace(/^\.\//, '');
  if (loaded.has(name)) return loaded.get(name).exports;
  const module = { exports: {} };
  loaded.set(name, module);
  const source = fs.readFileSync(path.join(__dirname, '../src', name + '.ts'), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  new Function('module', 'exports', 'require', js)(module, module.exports, load);
  return module.exports;
}
const intents = load('application-track199');
// Before the repair, use the actual board reader to expose its null regression.
const read = intents.storedApplicationIntentDto199 || intents.applicationIntentDto199;
for (const [track, key] of [['raider', 'office_25'], ['artisan', 'office_27']]) {
  const answers = Object.freeze({ applicationTrack: track, targetOffice: key, boardApplicationIntentOptIn: true });
  assert.deepEqual(read(answers), { applicationTrack: track, targetOffice: key }, key + ' retains its original stored descriptor');
  const fresh = intents.validateApplicationIntent199(track, key, () => false);
  assert.equal(fresh.error, 'invalid', key + ' remains unavailable for a new selection');
  assert.equal(fresh.field, 'targetOffice');
  assert.deepEqual(answers, { applicationTrack: track, targetOffice: key, boardApplicationIntentOptIn: true });
}
for (const answers of [
  {}, { applicationTrack: 'unknown', targetOffice: 'office_25' },
  { applicationTrack: 'artisan', targetOffice: 'office_25' },
  { applicationTrack: 'raider', targetOffice: 'office_27' },
  { applicationTrack: 'raider', targetOffice: 'office_999' },
  { applicationTrack: 'raider', targetOffice: 'office_11' },
  { applicationTrack: 'raider', targetOffice: {} },
  { applicationTrack: ['raider'], targetOffice: 'office_25' },
  { applicationTrack: 'raider', targetOffice: 'office_25 ' },
  { applicationTrack: 'raider', targetOffice: 'x'.repeat(81) },
]) assert.equal(read(answers), null, 'malformed, unknown or mismatched historical descriptor stays refused');
for (const answers of [
  { applicationTrack: 'member', targetOffice: null },
  { applicationTrack: 'raider', targetOffice: null },
  { applicationTrack: 'artisan', targetOffice: 'office_07' },
  { applicationTrack: 'high_council', targetOffice: 'office_14' },
]) assert.deepEqual(read(answers), answers, 'existing canonical descriptors retain their meaning');
console.log('PASS stored historical application reads; new eligibility and malformed refusals preserved');

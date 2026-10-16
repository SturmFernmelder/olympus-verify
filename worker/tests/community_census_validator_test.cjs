'use strict';

// Uses the repository TypeScript dependency in memory; no installs or emitted files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const Module = require('node:module');
const tsPath = require.resolve('typescript');
const ts = require(tsPath);
const sourcePath = path.resolve(__dirname, '../src/community-census-validator.ts');
const contractPath = path.resolve(__dirname, '../../addon/tests/fixtures/community-census/contract-v2.json');
const expectedContractHash = 'd90d371987af0ba914cde8c96ee9205599984b7a3dbaec8b0bfa2733754b2a0f';
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const contractBefore = hash(contractPath);
assert.equal(contractBefore, expectedContractHash, 'accepted contract pin');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const program = ts.createProgram([sourcePath], {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  strict: true, noEmit: true, skipLibCheck: true, types: [],
  lib: ['lib.es2022.d.ts'],
});
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => process.cwd(), getCanonicalFileName: file => file,
    getNewLine: () => '\n',
  }));
  process.exit(1);
}
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, strict: true },
  fileName: sourcePath,
});
const loaded = new Module(sourcePath, module);
loaded.filename = sourcePath;
loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath));
loaded._compile(compiled.outputText, sourcePath);
const { validateCensusJson, CENSUS_LIMITS } = loaded.exports;

if (process.argv.includes('--json')) {
  const file = process.argv[process.argv.indexOf('--json') + 1];
  const now = process.argv[process.argv.indexOf('--now') + 1];
  if (!file || !process.argv.includes('--now') || !now) {
    process.stderr.write('Usage: node community_census_validator_test.cjs --json <path> --now <integer>\n');
    process.exit(2);
  }
  let result;
  try {
    const bytes = fs.readFileSync(file);
    if (bytes.length > CENSUS_LIMITS.inputBytes) result = { ok: false, reason: 'input_size' };
    else result = validateCensusJson(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes), Number(now));
  } catch { result = { ok: false, reason: 'invalid_utf8_or_file' }; }
  assert.equal(hash(contractPath), contractBefore);
  // Let the complete large JSON write drain when stdout is a CI subprocess pipe.
  process.exitCode = result.ok ? 0 : 2;
  process.stdout.write(JSON.stringify(result) + '\n');
  return;
}

const NOW = 1800000000;
const row = (age = 0, name = 'Synthetic Guild') => {
  const result = { name, reportedCharacters: 100, receivedAt: NOW - age,
    fresh: age <= 900, counted: age <= 86400 };
  if (result.fresh) result.online = 10;
  return result;
};
const snapshot = (rows = [row()]) => ({ format: 'olympus-census-v1', addonVersion: '1.2.3',
  realmGroup: 'SyntheticRealmA+SyntheticRealmB', faction: 'Alliance', observedAt: NOW,
  source: 'community-observation', membershipProof: false, guilds: rows });
const json = value => JSON.stringify(value);
const accept = (value, now = NOW) => {
  const result = validateCensusJson(typeof value === 'string' ? value : json(value), now);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
};
const reject = (value, reason, now = NOW) => {
  const result = validateCensusJson(typeof value === 'string' ? value : json(value), now);
  assert.equal(result.ok, false, 'expected complete refusal');
  assert.equal(Object.hasOwn(result, 'snapshot'), false, 'no partial snapshot');
  assert.equal(Object.hasOwn(result, 'atReceipt'), false, 'no partial receipt metadata');
  if (reason) assert.equal(result.reason, reason);
};
const mutate = fn => { const value = snapshot(); fn(value); return value; };
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('contract numeric bounds match accepted V2', () => {
  assert.equal(CENSUS_LIMITS.guilds, contract.bounds.guilds);
  assert.equal(CENSUS_LIMITS.nameBytes, contract.bounds.nameBytes);
  assert.equal(CENSUS_LIMITS.realmGroupBytes, contract.bounds.realmGroupBytes);
  assert.equal(CENSUS_LIMITS.addonVersionBytes, contract.bounds.addonVersionBytes);
  assert.equal(CENSUS_LIMITS.characters, contract.bounds.charactersPerGuild);
  assert.equal(CENSUS_LIMITS.freshSeconds, contract.bounds.onlineFreshSeconds);
  assert.equal(CENSUS_LIMITS.countedSeconds, contract.bounds.totalFreshSeconds);
  assert.equal(CENSUS_LIMITS.retainedSeconds, contract.bounds.retainedSeconds);
});
test('fresh defensive output and provenance labels', () => {
  const input = snapshot();
  const result = accept(input);
  assert.deepEqual(result.snapshot, input);
  assert.notEqual(result.snapshot.guilds, input.guilds);
  input.guilds[0].name = 'changed';
  assert.equal(result.snapshot.guilds[0].name, 'Synthetic Guild');
  for (const frozen of [result, result.snapshot, result.snapshot.guilds, result.snapshot.guilds[0],
    result.atReceipt, result.atReceipt.guilds, result.atReceipt.guilds[0]]) assert(Object.isFrozen(frozen));
  assert.throws(() => { result.snapshot.guilds[0].reportedCharacters = 999; }, TypeError);
});
test('empty array is a valid complete snapshot', () => accept(snapshot([])));
test('300 rows accepted in producer-independent order', () =>
  accept(snapshot(Array.from({ length: 300 }, (_, i) => row(0, 'Guild ' + (300 - i))))));
test('301 rows refused', () => reject(snapshot(Array.from({ length: 301 }, (_, i) => row(0, 'Guild ' + i))), 'guild_array'));
test('malformed last row refuses all 300 rows', () => {
  const rows = Array.from({ length: 300 }, (_, i) => row(0, 'Guild ' + i));
  rows[299].reportedCharacters = 1001;
  reject(snapshot(rows), 'invalid_count');
});
test('duplicate last row refuses all 300 rows', () => {
  const rows = Array.from({ length: 300 }, (_, i) => row(0, 'Guild ' + i));
  rows[299].name = 'GUILD 0';
  reject(snapshot(rows), 'duplicate_guild');
});
for (const age of [0, 899, 900, 901, 86399, 86400, 86401, 604799, 604800]) {
  test('inclusive export age ' + age, () => {
    const result = accept(snapshot([row(age)]));
    assert.equal(result.snapshot.guilds[0].fresh, age <= 900);
    assert.equal(result.snapshot.guilds[0].counted, age <= 86400);
    assert.equal(Object.hasOwn(result.snapshot.guilds[0], 'online'), age <= 900);
  });
}
test('export age 604801 rejected without filtering', () => reject(snapshot([row(604801)]), 'expired_export_row'));
test('historical snapshot preserved while receipt claims expire', () => {
  const original = snapshot();
  const result = accept(original, NOW + 604801);
  assert.deepEqual(result.snapshot, original);
  assert.deepEqual(result.atReceipt, { receiptNow: NOW + 604801, snapshotAgeSeconds: 604801,
    guilds: [{ name: 'Synthetic Guild', ageSeconds: 604801, fresh: false, counted: false, retained: false }] });
});
for (const age of [900, 901, 86400, 86401, 604800, 604801]) {
  test('independent receipt age ' + age, () => {
    const status = accept(snapshot(), NOW + age).atReceipt.guilds[0];
    assert.equal(status.fresh, age <= 900);
    assert.equal(status.counted, age <= 86400);
    assert.equal(status.retained, age <= 604800);
  });
}
test('future snapshot rejected', () => reject(snapshot(), 'future_snapshot', NOW - 1));
test('future local receipt rejected', () => reject(snapshot([row(-1)]), 'future_receipt'));
test('zero clock valid', () => {
  const value = snapshot(); value.observedAt = 0; value.guilds[0].receivedAt = 0; accept(value, 0);
});
test('maximum clock valid', () => {
  const value = snapshot(); value.observedAt = CENSUS_LIMITS.maximumTimestamp;
  value.guilds[0].receivedAt = value.observedAt; accept(value, value.observedAt);
});
for (const clock of [-1, 0.5, NaN, Infinity, CENSUS_LIMITS.maximumTimestamp + 1, '1800000000', null]) {
  test('bad trusted receipt clock ' + String(clock), () => reject(snapshot(), 'invalid_receipt_clock', clock));
}
for (const field of ['observedAt', 'receivedAt']) {
  for (const clock of [-1, 0.5, CENSUS_LIMITS.maximumTimestamp + 1, '1800000000', null]) {
    test('bad ' + field + ' ' + String(clock), () => reject(mutate(value => {
      if (field === 'observedAt') value[field] = clock; else value.guilds[0][field] = clock;
    }), clock === 0.5 ? 'invalid_json_number' : field === 'observedAt' ? 'invalid_observed_clock' : 'invalid_received_clock'));
  }
}
for (const [field, maximum] of [['name', 128], ['realmGroup', 128], ['addonVersion', 32]]) {
  const set = (value, text) => { if (field === 'name') value.guilds[0].name = text; else value[field] = text; };
  for (const [label, value] of [['ASCII', 'a'.repeat(maximum)], ['two-byte', 'é'.repeat(maximum / 2)],
    ['four-byte', '😀'.repeat(maximum / 4)]]) {
    test(field + ' exact UTF8 bound ' + label, () => accept(mutate(item => set(item, value))));
    test(field + ' exceeds UTF8 bound ' + label, () => reject(mutate(item => set(item, value + 'a')), 'text_size'));
  }
  for (const value of ['', '\x00', '\x1f', '\x7f', 123, null]) {
    test(field + ' invalid text ' + json(value), () => reject(mutate(item => set(item, value)), 'invalid_text'));
  }
}
test('JSON escaped multibyte strings use decoded byte length', () => {
  const value = snapshot(); value.guilds[0].name = 'é'.repeat(64);
  accept(json(value).replaceAll('é', '\\u00e9'));
});
test('escaped quotes and slashes preserve guild name', () => {
  const value = snapshot(); value.guilds[0].name = 'Guild "\\/| test';
  assert.equal(accept(value).snapshot.guilds[0].name, value.guilds[0].name);
});
test('ASCII case-fold duplicates refused', () => reject(snapshot([row(0, 'OLYMPUS'), row(0, 'olympus')]), 'duplicate_guild'));
test('non-ASCII case is not folded', () => accept(snapshot([row(0, 'Ä'), row(0, 'ä')])));
test('Unicode normalization is not invented', () => accept(snapshot([row(0, 'é'), row(0, 'e\u0301')])));
for (const raw of ['"\\ud800"', '"\\udfff"', '"\\ud800x"', '"\\udc00\\ud800"', '"\ud800"', '"\udfff"']) {
  test('lone surrogate refused ' + json(raw), () => reject(raw, 'invalid_unicode'));
}
for (const field of ['format', 'source', 'membershipProof', 'faction']) {
  test('wrong ' + field + ' refused', () => reject(mutate(value => { value[field] = 'untrusted'; })));
}
test('Horde accepted', () => accept(mutate(value => { value.faction = 'Horde'; })));
for (const field of Object.keys(snapshot())) {
  test('missing root key ' + field, () => reject(mutate(value => { delete value[field]; }), 'closed_shape'));
}
test('root extra key refused', () => reject(mutate(value => { value.accountId = 'excluded'; }), 'closed_shape'));
test('row extra key refused', () => reject(mutate(value => { value.guilds[0].reporter = 'excluded'; }), 'closed_shape'));
for (const field of Object.keys(row())) {
  test('missing row key ' + field, () => reject(mutate(value => { delete value.guilds[0][field]; })));
}
for (const value of [null, {}, { 0: row() }, [null], [[row()]]]) {
  test('malformed guild array ' + json(value), () => reject(mutate(item => { item.guilds = value; })));
}
for (const count of [-1, 0.5, 1001, '1', null]) {
  test('bad count ' + json(count), () => reject(mutate(value => { value.guilds[0].reportedCharacters = count; })));
}
test('zero counts accepted', () => accept(mutate(value => {
  value.guilds[0].reportedCharacters = 0; value.guilds[0].online = 0;
})));
test('1000 counts accepted', () => accept(mutate(value => {
  value.guilds[0].reportedCharacters = 1000; value.guilds[0].online = 1000;
})));
for (const count of [-1, 0.5, 101, '1', null]) {
  test('bad online ' + json(count), () => reject(mutate(value => { value.guilds[0].online = count; })));
}
test('stale online forbidden even zero', () => {
  const value = snapshot([row(901)]); value.guilds[0].online = 0; reject(value, 'closed_shape');
});
for (const field of ['fresh', 'counted']) {
  for (const value of [false, 'true', 1, null]) {
    test('bad freshness ' + field + ' ' + json(value), () => reject(mutate(item => {
      item.guilds[0][field] = value;
    }), 'invalid_freshness_claim'));
  }
}
test('expired counted claim rejected', () => {
  const value = snapshot([row(86401)]); value.guilds[0].counted = true; reject(value, 'invalid_freshness_claim');
});
test('duplicate root JSON key refused', () => reject(json(snapshot()).replace('{', '{"format":"olympus-census-v1",'), 'duplicate_json_key'));
test('escaped duplicate JSON key refused', () => reject(json(snapshot()).replace('{', '{"for\\u006dat":"olympus-census-v1",'), 'duplicate_json_key'));
test('duplicate row JSON key refused', () => reject(json(snapshot()).replace('"name":', '"name":"x","name":'), 'duplicate_json_key'));
test('prototype key refused without pollution', () => {
  reject(json(snapshot()).replace('{', '{"__proto__":{"polluted":true},'), 'closed_shape');
  assert.equal({}.polluted, undefined);
});
for (const malformed of ['', ' ', 'null', '[]', 'true', '{}', '{', '{"x":}', '[,]', '[1,]',
  '{"x":1,}', '{"x" 1}', '{"x":01}', '{"x":+1}', '{"x":.1}', '{"x":1.}',
  '{"x":1e}', '{"x":NaN}', '{"x":Infinity}', '{"x":1e999}', '{"x":"\\q"}',
  '{"x":"\\u12"}', '{"x":"\t"}', '{}{}', '{} garbage', '{"x":truefalse}', '\ufeff{}']) {
  test('malformed JSON ' + json(malformed), () => reject(malformed));
}
test('maximum byte envelope accepted', () => {
  const raw = json(snapshot()); accept(raw + ' '.repeat(CENSUS_LIMITS.inputBytes - Buffer.byteLength(raw)));
});
test('300 maximum-width producer records fit the envelope', () => {
  const rows = Array.from({ length: 300 }, (_, i) => {
    const name = String(i).padStart(3, '0') + '\\'.repeat(125);
    return { ...row(0, name), reportedCharacters: 1000, online: 1000 };
  });
  const value = snapshot(rows);
  value.realmGroup = '\\'.repeat(128); value.addonVersion = '\\'.repeat(32);
  assert(Buffer.byteLength(json(value)) < CENSUS_LIMITS.inputBytes);
  accept(value);
});
test('300 maximum-width pipe-escaped producer records fit enlarged envelope', () => {
  const rows = Array.from({ length: 300 }, (_, i) => ({
    ...row(0, String(i).padStart(3, '0') + '|'.repeat(125)), reportedCharacters: 1000, online: 1000,
  }));
  const value = snapshot(rows);
  value.realmGroup = '|'.repeat(128); value.addonVersion = '|'.repeat(32);
  const wire = json(value).replaceAll('|', '\\u007c');
  assert(Buffer.byteLength(wire) > 196608, 'previous envelope cannot hold safe pipe encoding');
  assert(Buffer.byteLength(wire) <= CENSUS_LIMITS.inputBytes);
  assert.equal(wire.includes('|'), false, 'copy field has no raw pipe markup');
  assert.deepEqual(accept(wire).snapshot, value, 'JSON decoding preserves every pipe');
});
test('oversized byte envelope refused', () => reject(' '.repeat(CENSUS_LIMITS.inputBytes + 1), 'input_size'));
test('multibyte envelope bound uses bytes', () => reject('"' + 'é'.repeat(CENSUS_LIMITS.inputBytes / 2) + '"', 'input_size'));
test('excess depth refused', () => reject('['.repeat(9) + '0' + ']'.repeat(9), 'json_depth'));
test('excess nodes refused', () => reject('[' + Array(4096).fill('0').join(',') + ']', 'json_nodes'));
test('fraction rounding cannot create integral count', () => reject(json(snapshot()).replace('"reportedCharacters":100', '"reportedCharacters":100.0000000000000001'), 'invalid_json_number'));
test('fraction underflow cannot create zero count', () => reject(json(snapshot()).replace('"reportedCharacters":100', '"reportedCharacters":1e-999999'), 'invalid_json_number'));
test('exact integral JSON decimals accepted', () => accept(json(snapshot()).replace('"reportedCharacters":100', '"reportedCharacters":1.00e2')));
test('non-string API input refused', () => assert.equal(validateCensusJson(snapshot(), NOW).reason, 'invalid_input_type'));
test('independent calls do not share outputs', () => {
  const first = accept(snapshot()); const second = accept(snapshot());
  assert.notEqual(first.snapshot.guilds[0], second.snapshot.guilds[0]);
});

let failures = 0;
for (const [name, run] of tests) {
  try { run(); }
  catch (error) { failures++; process.stderr.write('FAIL: ' + name + '\n' + error.stack + '\n'); }
}
const contractAfter = hash(contractPath);
assert.equal(contractAfter, contractBefore, 'contract unchanged');
process.stdout.write(JSON.stringify({ status: failures ? 'FAIL' : 'PASS', checks: tests.length,
  passed: tests.length - failures, failed: failures, strictTypecheck: true,
  contractBefore, contractAfter, sourceSha256: hash(sourcePath), testSha256: hash(__filename),
  typescriptVersion: ts.version, typescriptPath: tsPath,
  limitations: ['pure unattached validator', 'no authentication, route, storage or provider qualification'] }, null, 2) + '\n');
process.exitCode = failures ? 1 : 0;

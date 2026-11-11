#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib');
const pack = require('../build-verify-addon.cjs'), root = path.resolve(__dirname, '../..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let passed = 0;
function check(label, fn) { fn(); passed++; console.log('PASS ' + label); }
const get = file => fs.readFileSync(path.join(root, file));
const result = pack.prepare(get), manifest = JSON.parse(result.manifest);
check('two builds are byte-identical', () => { const second = pack.prepare(get); assert.deepEqual(second, result); });
check('tracked ZIP and manifest equal the current source build', () => { assert.deepEqual(get(pack.ZIP), result.zip); assert.deepEqual(get(pack.MANIFEST), result.manifest); pack.build(root); });
check('version, complete archive digest and generator are bound', () => {
  assert.equal(manifest.schema, 'olympus-verify-public-download-v1'); assert.equal(manifest.version, pack.VERSION);
  assert.equal(get(pack.SOURCE + 'OlympusVerify.toc').toString('utf8').match(/^## Version: (.+)$/m)[1].trim(), pack.VERSION);
  assert.equal(manifest.archive.path, '/' + pack.ZIP.slice('worker/public/'.length));
  assert.equal(manifest.archive.bytes, result.zip.length); assert.equal(manifest.archive.sha256, hash(result.zip));
  assert.equal(manifest.generator.sha256, hash(get('scripts/build-verify-addon.cjs')));
});
const expected = ['Bindings.xml','Config.example.lua','Libs/OlympusHmac.lua','Libs/OlympusQr.lua','OlympusVerify.lua','OlympusVerify.toc',
  'OlympusVerifyAutoSync.lua','OlympusVerifyBrowser.lua','OlympusVerifyCensus.lua','OlympusVerifyGuild.lua','OlympusVerifyLaunch229.lua','OlympusVerifyLive242.lua',
  'OlympusVerifyOfficerInvites233.lua','OlympusVerifyPreview.lua','OlympusVerifyRanks.lua','OlympusVerifyRoster.lua','OlympusVerifyTreasury.lua','OlympusVerifyUI.lua'];
check('archive allowlist is exactly the 18 permitted public files', () => {
  assert.deepEqual(pack.FILES, expected); assert.deepEqual(manifest.files.map(row => row.path), expected.map(file => 'OlympusVerify/' + file));
});
// Independently walk both ZIP record tables and use Node's native zlib CRC, rather than the generator's CRC routine.
const zip = result.zip, end = zip.length - 22;
check('ZIP has exactly one fixed end record with no comment/trailer', () => {
  assert.equal(zip.readUInt32LE(end), 0x06054b50); assert.equal(zip.readUInt16LE(end + 8), 18);
  assert.equal(zip.readUInt16LE(end + 10), 18); assert.equal(zip.readUInt16LE(end + 20), 0);
});
let central = zip.readUInt32LE(end + 16), local = 0;
for (let i = 0; i < expected.length; i++) check('ZIP entry/source/manifest parity: ' + expected[i], () => {
  assert.equal(zip.readUInt32LE(central), 0x02014b50); assert.equal(zip.readUInt32LE(local), 0x04034b50);
  assert.equal(zip.readUInt16LE(central + 8), 0x800); assert.equal(zip.readUInt16LE(central + 10), 0);
  assert.equal(zip.readUInt16LE(central + 12), 0); assert.equal(zip.readUInt16LE(central + 14), 33);
  assert.equal(zip.readUInt32LE(central + 38), (0o100644 << 16) >>> 0); assert.equal(zip.readUInt32LE(central + 42), local);
  const nameLength = zip.readUInt16LE(local + 26), size = zip.readUInt32LE(local + 18), name = zip.subarray(local + 30, local + 30 + nameLength).toString('utf8');
  assert.equal(name, 'OlympusVerify/' + expected[i]); assert.equal(zip.readUInt16LE(local + 28), 0);
  assert.equal(zip.readUInt16LE(central + 28), nameLength); assert.equal(zip.readUInt16LE(central + 30), 0); assert.equal(zip.readUInt16LE(central + 32), 0);
  assert.equal(zip.subarray(central + 46, central + 46 + nameLength).toString('utf8'), name);
  const bytes = zip.subarray(local + 30 + nameLength, local + 30 + nameLength + size);
  assert.deepEqual(bytes, get(pack.SOURCE + expected[i])); assert.equal(zip.readUInt32LE(local + 14), zlib.crc32(bytes));
  assert.equal(zip.readUInt32LE(central + 16), zlib.crc32(bytes)); assert.equal(zip.readUInt32LE(central + 20), size);
  assert.deepEqual(manifest.files[i], {path:name, bytes:size, sha256:hash(bytes)});
  local += 30 + nameLength + size; central += 46 + nameLength;
});
check('local and central records consume the entire archive exactly once', () => {
  assert.equal(local, zip.readUInt32LE(end + 16)); assert.equal(central, end); assert.equal(central - local, zip.readUInt32LE(end + 12));
});
check('packager never requests configuration, SavedVariables or exchange inputs', () => {
  const seen = []; pack.prepare(file => { seen.push(file); return get(file); });
  assert.deepEqual(seen, [...expected.map(file => pack.SOURCE + file), 'scripts/build-verify-addon.cjs']);
  assert(!manifest.files.some(row => /(?:^|\/)(?:Config\.lua|OlympusQueue\.lua|OlympusLaunchQueue\.lua|OlympusVerifyLists\.lua|SavedVariables)$/.test(row.path)));
});
check('changed public bytes update the actual archive and manifest digest', () => {
  const file = pack.SOURCE + 'Bindings.xml', changed = Buffer.concat([get(file), Buffer.from('\n')]);
  const next = pack.prepare(name => name === file ? changed : get(name)), nextManifest = JSON.parse(next.manifest);
  assert.notEqual(hash(next.zip), hash(result.zip));
  assert.equal(nextManifest.archive.sha256, hash(next.zip));
  assert.equal(nextManifest.files.find(row => row.path === 'OlympusVerify/Bindings.xml').sha256, hash(changed));
});
check('missing and oversized public source cannot become a partial package', () => {
  assert.throws(() => pack.prepare(name => name === pack.SOURCE + 'Bindings.xml' ? Buffer.alloc(0) : get(name)), /Bounded public addon/);
  assert.throws(() => pack.prepare(name => name === pack.SOURCE + 'Bindings.xml' ? Buffer.alloc(1024 * 1024 + 1) : get(name)), /Bounded public addon/);
});
console.log(JSON.stringify({passed, failed:0, archiveSHA256:hash(zip), files:expected.length}));

#!/usr/bin/env node
'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const {build, prepare, SOURCE, TARGET, PINS, PREFIX, SUFFIX, DECODER_FROM, DECODER_TO} = require('../build-army-qr-review.cjs');
const root = path.resolve(__dirname, '../..'), scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-army-dormant-'));
let passed = 0, failed = 0;
function check(label, operation) { try { operation(); passed++; console.log('PASS ' + label); } catch (error) { failed++; console.error('FAIL ' + label + ': ' + error.message); } }
try {
  check('shipping package has exact reviewed inputs, generated inventory and disabled contract', () => {
    assert.deepEqual(build(root), {files: 4, activation: false, uploads: false});
    const manifest = JSON.parse(fs.readFileSync(path.join(root, TARGET, 'manifest.json'), 'utf8'));
    assert.equal(manifest.activation, false); assert.equal(manifest.uploads, false); assert.equal(manifest.runtimeOverride, false); assert.equal(manifest.shippingHtml, false);
    assert.equal(manifest.sourceVerified, false); assert.equal(manifest.membershipProof, false); assert.equal(manifest.sources.length, 6); assert.equal(manifest.generated.length, 3);
    assert.deepEqual(manifest.reviewOnlySources, [SOURCE + '/pilot.css']); assert.equal(manifest.reused.length, 2); assert.equal(manifest.projections.length, 1);
  });
  for (const name of ['protocol.js', 'decoder.js', 'pilot.js']) {
    check('reviewed script retained with only documented dormant wrapping/path projection: ' + name, () => {
      const input = fs.readFileSync(path.join(root, SOURCE, name)), output = fs.readFileSync(path.join(root, TARGET, name));
      const inner = name === 'decoder.js' ? Buffer.from(input.toString('utf8').replace(DECODER_FROM, DECODER_TO)) : input;
      assert.ok(output.equals(Buffer.concat([PREFIX, inner, SUFFIX])));
    });
    check('direct dormant script has zero browser or worker effects despite overrides: ' + name, () => {
      let touched = 0;
      const scope = {activation: true, uploads: true, ARMY_QR_ENABLED: true};
      for (const key of ['document', 'window', 'self', 'navigator', 'fetch', 'Worker', 'WebSocket', 'XMLHttpRequest', 'importScripts', 'localStorage', 'sessionStorage', 'indexedDB', 'setTimeout', 'setInterval', 'addEventListener', 'postMessage', 'crypto', 'TextEncoder', 'TextDecoder', 'module', 'exports']) {
        Object.defineProperty(scope, key, {get() { touched++; throw Error('Unexpected browser/worker access: ' + key); }, set() { touched++; throw Error('Unexpected browser/worker write: ' + key); }, configurable: false});
      }
      const before = Object.getOwnPropertyNames(scope).sort();
      vm.runInNewContext(fs.readFileSync(path.join(root, TARGET, name), 'utf8'), scope, {filename: name, timeout: 1000});
      assert.equal(touched, 0); assert.deepEqual(Object.getOwnPropertyNames(scope).sort(), before);
      assert.equal(scope.activation, true); assert.equal(scope.uploads, true);
    });
  }
  check('decoder projection changes exactly one import path and binds original and projected hashes', () => {
    const original = fs.readFileSync(path.join(root, SOURCE, 'decoder.js'), 'utf8');
    const projected = fs.readFileSync(path.join(root, TARGET, 'decoder.js')).subarray(PREFIX.length, -SUFFIX.length).toString('utf8');
    assert.equal(original.split(DECODER_FROM).length, 2); assert.equal(projected.split(DECODER_TO).length, 2);
    assert.equal(projected.replace(DECODER_TO, DECODER_FROM), original);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, TARGET, 'manifest.json'), 'utf8')), projection = manifest.projections[0];
    const hash = value => require('node:crypto').createHash('sha256').update(value).digest('hex');
    assert.equal(projection.originalSha256, hash(original)); assert.equal(projection.projectedSha256, hash(projected)); assert.equal(projection.projectedBytes, Buffer.byteLength(projected));
    assert.equal(projection.from, DECODER_FROM); assert.equal(projection.to, DECODER_TO); assert.equal(projection.substitutions, 1);
  });
  check('review-only CSS is not shipped and existing vendor/license bytes are reused without duplicate assets', () => {
    assert.ok(!fs.existsSync(path.join(root, TARGET, 'pilot.css'))); assert.ok(!fs.existsSync(path.join(root, TARGET, 'vendor')));
    const manifest = JSON.parse(fs.readFileSync(path.join(root, TARGET, 'manifest.json'), 'utf8'));
    for (const item of manifest.reused) {
      assert.ok(fs.readFileSync(path.join(root, item.path)).equals(fs.readFileSync(path.join(root, item.sourcePath))));
      assert.ok(item.path.startsWith('worker/public/static/qr-vendor/'));
    }
  });
  for (const [name] of PINS) { const to = path.join(scratch, SOURCE, name); fs.mkdirSync(path.dirname(to), {recursive: true}); fs.copyFileSync(path.join(root, SOURCE, name), to); }
  for (const name of ['jsqr-1.4.0.js', 'jsqr-1.4.0.LICENSE.txt']) {
    const to = path.join(scratch, 'worker/public/static/qr-vendor', name); fs.mkdirSync(path.dirname(to), {recursive: true}); fs.copyFileSync(path.join(root, 'worker/public/static/qr-vendor', name), to);
  }
  check('explicit generation is deterministic and check mode never changes files or mtimes', () => {
    assert.deepEqual(build(scratch, true), build(root));
    const files = [...prepare(scratch).keys()].map(name => path.join(scratch, TARGET, name));
    const before = files.map(file => [fs.readFileSync(file).toString('hex'), fs.statSync(file).mtimeMs]);
    build(scratch);
    assert.deepEqual(files.map(file => [fs.readFileSync(file).toString('hex'), fs.statSync(file).mtimeMs]), before);
  });
  for (const [name] of PINS) check('source pin drift is refused before any output changes: ' + name, () => {
    const file = path.join(scratch, SOURCE, name), original = fs.readFileSync(file), target = path.join(scratch, TARGET, 'manifest.json'), before = fs.readFileSync(target);
    fs.appendFileSync(file, '\n');
    try { assert.throws(() => build(scratch, true), /source pin drift/); assert.ok(fs.readFileSync(target).equals(before)); }
    finally { fs.writeFileSync(file, original); }
  });
  for (const name of ['jsqr-1.4.0.js', 'jsqr-1.4.0.LICENSE.txt']) check('reused production vendor pin drift is refused before writing: ' + name, () => {
    const file = path.join(scratch, 'worker/public/static/qr-vendor', name), original = fs.readFileSync(file), target = path.join(scratch, TARGET, 'manifest.json'), before = fs.readFileSync(target);
    fs.appendFileSync(file, '\n');
    try { assert.throws(() => build(scratch, true), /production QR vendor pin drift/); assert.ok(fs.readFileSync(target).equals(before)); }
    finally { fs.writeFileSync(file, original); }
  });
  check('generated entry activation tampering fails read-only check', () => {
    const file = path.join(scratch, TARGET, 'pilot.js'), original = fs.readFileSync(file);
    fs.writeFileSync(file, original.toString('utf8').replace('activation = false', 'activation = true'));
    try { assert.throws(() => build(scratch), /generated byte drift/); } finally { fs.writeFileSync(file, original); }
  });
  check('unexpected HTML or unmanifested assets are refused instead of published or deleted', () => {
    const file = path.join(scratch, TARGET, 'index.html'); fs.writeFileSync(file, '<!doctype html>');
    try { assert.throws(() => build(scratch), /Unexpected/); assert.throws(() => build(scratch, true), /Unexpected/); assert.equal(fs.readFileSync(file, 'utf8'), '<!doctype html>'); }
    finally { fs.unlinkSync(file); }
  });
} finally {
  assert.equal(path.dirname(path.resolve(scratch)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(scratch).startsWith('olympus-army-dormant-'));
  fs.rmSync(scratch, {recursive: true, force: true});
}
console.log(passed + '/' + (passed + failed) + ' dormant Army QR package checks passed');
if (failed) process.exitCode = 1;

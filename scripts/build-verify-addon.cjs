#!/usr/bin/env node
'use strict';
// Public source only. Fixed inputs, ZIP metadata and ordering; never scans a local addon installation.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const SOURCE = 'addon/OlympusVerify/';
// The package identity follows the shipped TOC, never a second manually bumped version.
const toc = fs.readFileSync(path.resolve(__dirname, '..', SOURCE, 'OlympusVerify.toc'), 'utf8');
const versions = [...toc.matchAll(/^## Version: ([0-9]+\.[0-9]+\.[0-9]+)\r?$/gm)];
if (versions.length !== 1) throw Error('public addon TOC must declare one version');
const VERSION = versions[0][1];
const ZIP = `worker/public/static/olympus-verify/olympus-verify-${VERSION}.zip`;
const MANIFEST = 'worker/public/static/olympus-verify/version.json';
const FILES = Object.freeze(['Bindings.xml', 'Config.example.lua', 'Libs/OlympusHmac.lua', 'Libs/OlympusQr.lua',
  'OlympusVerify.lua', 'OlympusVerify.toc', 'OlympusVerifyAutoSync.lua', 'OlympusVerifyBrowser.lua',
  'OlympusVerifyCensus.lua', 'OlympusVerifyGuild.lua', 'OlympusVerifyLaunch229.lua', 'OlympusVerifyLive242.lua', 'OlympusVerifyOfficerInvites233.lua',
  'OlympusVerifyPreview.lua', 'OlympusVerifyRanks.lua', 'OlympusVerifyRoster.lua', 'OlympusVerifyTreasury.lua', 'OlympusVerifyUI.lua']);
// Current package digests describe current bytes. Historical repair source pins
// remain in Git; the owner permanently retired them as build admission gates.
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function prepare(get) {
  const local = [], central = [], files = []; let offset = 0;
  for (const file of FILES) {
    const bytes = get(SOURCE + file);
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 1024 * 1024) throw Error('Bounded public addon source required: ' + file);
    const digest = sha(bytes);
    const name = Buffer.from('OlympusVerify/' + file), crc = crc32(bytes), h = Buffer.alloc(30), c = Buffer.alloc(46);
    h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt16LE(33, 12);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(bytes.length, 18); h.writeUInt32LE(bytes.length, 22); h.writeUInt16LE(name.length, 26);
    c.writeUInt32LE(0x02014b50); c.writeUInt16LE(0x0314, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(33, 14);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(bytes.length, 20); c.writeUInt32LE(bytes.length, 24); c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE((0o100644 << 16) >>> 0, 38); c.writeUInt32LE(offset, 42);
    local.push(h, name, bytes); central.push(c, name); offset += h.length + name.length + bytes.length;
    files.push({ path: name.toString('utf8'), bytes: bytes.length, sha256: digest });
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(FILES.length, 8); end.writeUInt16LE(FILES.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  const zip = Buffer.concat([...local, directory, end]);
  const generator = get('scripts/build-verify-addon.cjs');
  const manifest = Buffer.from(JSON.stringify({ schema: 'olympus-verify-public-download-v1', addon: 'OlympusVerify', version: VERSION,
    generator: { path: 'scripts/build-verify-addon.cjs', bytes: generator.length, sha256: sha(generator) },
    archive: { path: ZIP.slice('worker/public'.length), bytes: zip.length, sha256: sha(zip) },
    files, localFilesExcluded: ['Config.lua', 'OlympusQueue.lua', 'OlympusLaunchQueue.lua', 'OlympusVerifyLists.lua', 'SavedVariables'],
    installation: 'Preserve existing private Config.lua, generated exchange files and SavedVariables. This package contains public addon code and Config.example.lua only.'
  }, null, 2) + '\n');
  return { zip, manifest };
}
function ordinary(root, relative, allowMissing = false) {
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if (allowMissing && !fs.existsSync(current)) continue;
    if (fs.lstatSync(current).isSymbolicLink()) throw Error('Linked package path refused');
  }
  return current;
}
function build(root, write = false) {
  const result = prepare(file => fs.readFileSync(ordinary(root, file)));
  // Prepare every input before touching either output; no local Config/generated/SV reads.
  for (const [file, bytes] of [[ZIP, result.zip], [MANIFEST, result.manifest]]) {
    const target = ordinary(root, file, write);
    if (write) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes); }
    else if (!fs.readFileSync(target).equals(bytes)) throw Error('Public addon package drift: ' + file);
  }
  return { version: VERSION, files: FILES.length, bytes: result.zip.length, sha256: sha(result.zip) };
}
module.exports = Object.freeze({ VERSION, SOURCE, ZIP, MANIFEST, FILES, prepare, build, crc32 });
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || args.length === 1 && !['--check', '--write'].includes(args[0])) throw Error('Use --check or --write');
    console.log(JSON.stringify(build(path.resolve(__dirname, '..'), args[0] === '--write')));
  } catch (e) { console.error('FAIL ' + e.message); process.exitCode = 1; }
}

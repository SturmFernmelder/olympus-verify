// Exact local-client cursor conversion and finite CSS scope. No browser automation, game or provider access.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { inflateSync } = require('node:zlib'), { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'), provenance = require('../../tools/wow-cursor-provenance.json');
let checks = 0;
const check = (label, value) => { assert.ok(value, label); checks++; console.log('PASS ' + label); };
function pngPixels(png) {
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  let header, parts = [];
  for (let at = 8; at < png.length;) {
    const size = png.readUInt32BE(at), kind = png.toString('ascii', at + 4, at + 8);
    assert.ok(at + 12 + size <= png.length);
    const body = png.subarray(at + 8, at + 8 + size);
    if (kind === 'IHDR') header = body;
    if (kind === 'IDAT') parts.push(body);
    at += size + 12;
    if (kind === 'IEND') break;
  }
  assert.ok(header); const width = header.readUInt32BE(0), height = header.readUInt32BE(4);
  assert.equal(width, 32); assert.equal(height, 32);
  assert.deepEqual([...header.subarray(8)], [8, 6, 0, 0, 0]); // 8-bit RGBA, original dimensions, no interlace.
  const bytes = inflateSync(Buffer.concat(parts)), stride = width * 4, pixels = Buffer.alloc(stride * height);
  assert.equal(bytes.length, height * (stride + 1));
  const paeth = (a, b, c) => { const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c); return da <= db && da <= dc ? a : db <= dc ? b : c; };
  for (let y = 0; y < height; y++) {
    const filter = bytes[y * (stride + 1)]; assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x, left = x >= 4 ? pixels[at - 4] : 0, up = y ? pixels[at - stride] : 0, upperLeft = y && x >= 4 ? pixels[at - stride - 4] : 0;
      const prediction = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, upperLeft)][filter];
      pixels[at] = (bytes[y * (stride + 1) + x + 1] + prediction) & 255;
    }
  }
  return pixels;
}
function main() {
  check('cursor provenance names the actual offline Classic client build', provenance.product === 'wow_classic_era' && provenance.clientVersion === '1.15.9.70003' && provenance.buildNumber === 70003);
  check('only the normal and optional interaction client cursors are included', provenance.assets.length === 2 && provenance.assets[0].fileDataId === 131028 && provenance.assets[1].fileDataId === 131021);
  for (const row of provenance.assets) {
    const png = fs.readFileSync(path.join(root, 'public', row.asset));
    const pixels = pngPixels(png), alpha = Array.from({ length: 1024 }, (_, i) => pixels[i * 4 + 3]);
    check(row.clientPath + ' has the recorded exact PNG bytes', png.length === row.assetBytes && createHash('sha256').update(png).digest('hex') === row.assetSha256);
    check(row.clientPath + ' preserves the original RGBA pixels including its separate alpha', createHash('sha256').update(pixels).digest('hex') === row.rgbaSha256);
    check(row.clientPath + ' is visible with both opaque and transparent pixels', Math.min(...alpha) === 0 && Math.max(...alpha) === 255 && alpha.filter(a => a > 0).length > 100);
    check(row.clientPath + ' remains a static original-size image', row.width === 32 && row.height === 32 && !png.includes(Buffer.from('acTL')));
  }
  const css = fs.readFileSync(path.join(root, 'public/static/wow-cursor.css'), 'utf8');
  check('custom cursors require both hover and a fine pointer', /@media\s*\(hover:hover\)\s+and\s+\(pointer:fine\)/.test(css));
  check('forced-color accessibility mode retains the browser cursor', /and\s+\(forced-colors:none\)/.test(css));
  check('all cursor declarations are inside the single accessibility media gate', !css.slice(0, css.indexOf('@media')).includes('cursor:') && css.trim().endsWith('}') && (css.match(/@media/g) || []).length === 1);
  check('ordinary content inherits the game pointer with native fallback and in-image hotspot', css.includes("body{cursor:url('/static/wow/cursor-point.png') 0 0,auto}") && !/(?:p,li|h1,h2|td,th|label,).*cursor:auto/.test(css));
  check('interactive pointer keeps its semantic native fallback', css.includes("cursor:url('/static/wow/cursor-interact.png') 0 0,pointer"));
  check('disabled buttons and links cannot receive the interaction cursor', css.includes('a[href]:not([aria-disabled="true"])') && css.includes('button:not(:disabled):not([aria-disabled="true"])') && css.includes(':is(:disabled,[aria-disabled="true"]){cursor:not-allowed}'));
  check('editable controls retain their native text and selection cursors', css.includes(':is(input,textarea,select,[contenteditable]:not([contenteditable="false"])){cursor:auto}'));
  check('every custom cursor rule honors the visible preference opt-out', (css.match(/cursor:/g) || []).length === (css.match(/html:not\(\[data-game-cursor="off"\]\)/g) || []).length);
  check('cursor enhancement does not change text selection, resize, focus or pointer events', !/(?:user-select|resize|outline|pointer-events|touch-action)\s*:/.test(css));
  check('cursor styles use no blanket descendant override or remote dependency', !/(?:^|[{},])\s*\*/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')) && !/https?:|!important/.test(css));
  console.log(`\n${checks}/${checks} passed`);
}
try { main(); } catch (error) { console.error(error); process.exitCode = 1; }

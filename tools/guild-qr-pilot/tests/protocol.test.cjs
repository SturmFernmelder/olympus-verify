'use strict';
// Independent byte/framing oracle: no game, browser permission, storage or network.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const zlib = require('node:zlib');
const P = require('../protocol.js');
const NONCE = '0123456789abcdef0123456789abcdef';
const OTHER = 'fedcba9876543210fedcba9876543210';
const NOW = 1800000000;
let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.stack); }
}
const bytes = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function specimen() {
  return {format: 'olympus-stat-observation-v1', scope: 'own-guild', source: 'volunteer-client', sourceVerified: false,
    membershipProof: false, addonVersion: '0.1.0', realmGroup: 'Synthetic Realm', faction: 'Alliance',
    observedAt: NOW - 10, guilds: [{name: 'Synthetic Guild', receivedAt: NOW - 10, reportedCharacters: 100, online: 25}]};
}
// A full independent Node SHA256 plus raw 75-byte parts, rather than encodeFrames.
function frameBytes(raw, nonce = NONCE) {
  raw = Buffer.from(raw);
  const digest = crypto.createHash('sha256').update(raw).digest('base64url');
  const total = Math.ceil(raw.length / 75), frames = [];
  for (let i = 0; i < total; i++) frames.push(['OLCS1', nonce, digest, String(i + 1).padStart(3, '0'),
    String(total).padStart(3, '0'), raw.subarray(i * 75, (i + 1) * 75).toString('base64url')].join('|'));
  return frames;
}
const framesFor = (value = specimen(), nonce = NONCE) => frameBytes(bytes(value), nonce);
const validate = value => P.validatePayload(bytes(value), {nowSeconds: NOW});
function scan(clock = () => NOW * 1000) { return P.createAssembler({nonce: NONCE, clock}); }
async function assemble(frames, assembler = scan()) { let result; for (const frame of frames) result = await assembler.add(frame); return result; }
function mutateFrame(frame, index, value) { const fields = frame.split('|'); fields[index] = value; return fields.join('|'); }
function pngHeader(width=342,height=342) {
  const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write('IHDR',12);
  b.writeUInt32BE(width,16);b.writeUInt32BE(height,20);b[24]=8;b[25]=6;b.writeUInt32BE(zlib.crc32(b.subarray(12,29)),29);return b;
}
function jpegHeader(width=640,height=480,marker=0xc0) {
  const b=Buffer.from([0xff,0xd8,0xff,marker,0,17,8,0,0,0,0,3,1,0x11,0,2,0x11,0,3,0x11,0]);
  b.writeUInt16BE(height,7);b.writeUInt16BE(width,9);return b;
}
function webpHeader(width=640,height=480,kind='VP8 ',extended=null) {
  let data;
  if(kind==='VP8L'){data=Buffer.alloc(5);data[0]=0x2f;data.writeUInt32LE((width-1)+((height-1)<<14),1);}
  else {data=Buffer.from([0,0,0,157,1,42,0,0,0,0]);data.writeUInt16LE(width,6);data.writeUInt16LE(height,8);}
  const chunks=[];
  function chunk(type,value){const h=Buffer.alloc(8);h.write(type);h.writeUInt32LE(value.length,4);chunks.push(h,value);if(value.length&1)chunks.push(Buffer.alloc(1));}
  if(extended){const x=Buffer.alloc(10);x[0]=extended.flags||0;x.writeUIntLE((extended.width||width)-1,4,3);x.writeUIntLE((extended.height||height)-1,7,3);chunk('VP8X',x);}
  chunk(kind,data);const body=Buffer.concat([Buffer.from('WEBP'),...chunks]),header=Buffer.alloc(8);header.write('RIFF');header.writeUInt32LE(body.length,4);return Buffer.concat([header,body]);
}
const inspect=(b,mime)=>P.inspectImageHeader(b,mime,{fileBytes:b.length});
function rejectsValue(label, mutate, pattern) {
  return check(label, () => { const value = specimen(); mutate(value); assert.throws(() => validate(value), pattern); });
}
async function controlledDigest(fn) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  let resume;
  Object.defineProperty(globalThis, 'crypto', {configurable: true, value: {subtle: {digest: (_algorithm, input) =>
    new Promise(resolve => { const copy = Buffer.from(input); resume = () => resolve(crypto.createHash('sha256').update(copy).digest()); })}}});
  try { await fn(() => { assert.equal(typeof resume, 'function'); resume(); }); }
  finally { if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor); else delete globalThis.crypto; }
}
(async () => {
  await check('fixed limits retain 1023 bytes,14 parts and30second lease', () => {
    assert.equal(P.LIMITS.payloadBytes, 1023); assert.equal(P.LIMITS.parts, 14); assert.equal(P.LIMITS.captureMs, 30000);
    assert.equal(P.LIMITS.onlineAgeSeconds, 900); assert.equal(P.LIMITS.reviewMs, 900000);
  });
  await check('independent raw75byte frames roundtrip exact canonical one-guild payload', async () => {
    const input = specimen(), frames = framesFor(input), out = await assemble(frames);
    assert.deepEqual(out.payload, input); assert.equal(out.status, 'complete'); assert.equal(out.received, frames.length);
    assert.ok(Object.isFrozen(out.payload) && Object.isFrozen(out.payload.guilds) && Object.isFrozen(out.payload.guilds[0]));
    assert.deepEqual(frames, await P.encodeFrames(input, NONCE, {nowSeconds: NOW}));
  });
  await check('reverse-order parts complete without exposing partial payload', async () => {
    const frames = framesFor(), a = scan();
    for (const frame of frames.slice(1).reverse()) { const out = await a.add(frame); assert.equal(out.status, 'pending'); assert.ok(!Object.hasOwn(out, 'payload')); }
    assert.deepEqual((await a.add(frames[0])).payload, specimen());
  });
  await check('identical duplicates do not increase count or extend lease', async () => {
    let clock = NOW * 1000; const a = scan(() => clock), frames = framesFor();
    await a.add(frames[0]); clock += 29999; const out = await a.add(frames[0]); assert.equal(out.received, 1);
    clock++; await assert.rejects(a.add(frames[1]), /30-second/); assert.deepEqual(a.progress, {received: 0, total: null});
  });
  await check('different nonce aborts and prevents later original fragments', async () => {
    const a = scan(); await a.add(framesFor()[0]); await assert.rejects(a.add(framesFor(specimen(), OTHER)[1]), /another scan/);
    await assert.rejects(a.add(framesFor()[1]), /ended/);
  });
  await check('mixed hash aborts entire in-progress assembly', async () => {
    const a = scan(), changed = specimen(); changed.guilds[0].reportedCharacters = 101;
    await a.add(framesFor()[0]); await assert.rejects(a.add(framesFor(changed)[1]), /Mixed snapshot/); assert.equal(a.progress.received, 0);
  });
  await check('mixed total aborts even with original hash', async () => {
    const frames = framesFor(), a = scan(); await a.add(frames[0]);
    await assert.rejects(a.add(mutateFrame(frames[1], 4, String(frames.length + 1).padStart(3, '0'))), /Mixed snapshot/);
  });
  await check('conflicting duplicate part is fatal', async () => {
    const frames = framesFor(), fields = frames[0].split('|'), raw = Buffer.from(fields[5], 'base64url'); raw[0] ^= 1;
    fields[5] = raw.toString('base64url'); const a = scan(); await a.add(frames[0]);
    await assert.rejects(a.add(fields.join('|')), /Conflicting duplicate/); assert.equal(a.progress.received, 0);
  });
  await check('matching framing with altered body still fails fullSHA256', async () => {
    const frames = framesFor(), fields = frames.at(-1).split('|'), raw = Buffer.from(fields[5], 'base64url'); raw[0] ^= 1;
    fields[5] = raw.toString('base64url'); frames[frames.length - 1] = fields.join('|');
    await assert.rejects(assemble(frames), /checksum/);
  });
  await check('deadline is strict at30seconds before decoding', async () => {
    let clock = NOW * 1000; const a = scan(() => clock); clock += 30000; await assert.rejects(a.add(framesFor()[0]), /30-second/);
  });
  await check('monotonic local-clock rollback terminates assembly', async () => {
    let clock = NOW * 1000; const a = scan(() => clock); await a.add(framesFor()[0]); clock--;
    await assert.rejects(a.add(framesFor()[1]), /backwards/); assert.equal(a.progress.received, 0);
  });
  await check('invalid initial and later clocks fail closed', async () => {
    for (const value of [-1, NaN, Infinity, 1.5]) assert.throws(() => P.createAssembler({nonce: NONCE, clock: () => value}), /clock/);
    let value = NOW * 1000; const a = scan(() => value); value = NaN; await assert.rejects(a.add(framesFor()[0]), /clock/);
  });
  await check('explicit cancellation clears fragments and rejects every later frame', async () => {
    const a = scan(); await a.add(framesFor()[0]); a.clear(); assert.deepEqual(a.progress, {received: 0, total: null});
    await assert.rejects(a.add(framesFor()[1]), /ended/);
  });
  await check('late digest after cancellation cannot publish payload', async () => controlledDigest(async resume => {
    const a = scan(), frames = framesFor(); for (const frame of frames.slice(0, -1)) await a.add(frame);
    const pending = a.add(frames.at(-1)); a.clear(); resume(); await assert.rejects(pending, /cancelled/);
  }));
  await check('overlapping finalverification aborts both attempts', async () => controlledDigest(async resume => {
    const a = scan(), frames = framesFor(); for (const frame of frames.slice(0, -1)) await a.add(frame);
    const pending = a.add(frames.at(-1)); await assert.rejects(a.add(frames[0]), /already being verified/);
    resume(); await assert.rejects(pending, /cancelled/); assert.equal(a.progress.received, 0);
  }));
  await check('deadline is rechecked after asynchronous digest', async () => controlledDigest(async resume => {
    let clock = NOW * 1000; const a = scan(() => clock), frames = framesFor(); for (const frame of frames.slice(0, -1)) await a.add(frame);
    const pending = a.add(frames.at(-1)); clock += 30000; resume(); await assert.rejects(pending, /30-second/);
  }));
  await check('complete transfer is one-use and cannot be made fresh by rereading', async () => {
    const a = scan(), frames = framesFor(); await assemble(frames, a); await assert.rejects(a.add(frames[0]), /ended/);
  });
  await check('valid Unicode survives canonical UTF8 with byte-bound labels', async () => {
    const value = specimen(); value.realmGroup = 'Étoile 🛡'; value.guilds[0].name = '山のOlympus';
    assert.deepEqual((await assemble(framesFor(value))).payload, value);
    value.realmGroup = 'é'.repeat(64); assert.doesNotThrow(() => validate(value)); value.realmGroup += 'a'; assert.throws(() => validate(value), /bounded/);
  });
  await check('escaped lone surrogate labels refuse rather than replacement', () => {
    const value = specimen(); value.guilds[0].name = '\ud800'; assert.throws(() => validate(value), /Unicode/);
    value.guilds[0].name = '\udfff'; assert.throws(() => validate(value), /Unicode/);
  });
  await check('malformed UTF8 sequences and BOM are fatal', () => {
    for (const suffix of [Buffer.from([0xc0,0xaf]), Buffer.from([0xed,0xa0,0x80]), Buffer.from([0xff])])
      assert.throws(() => P.validatePayload(Buffer.concat([bytes(specimen()), suffix]), {nowSeconds: NOW}), /UTF-8/);
    assert.throws(() => P.validatePayload(Buffer.concat([Buffer.from([0xef,0xbb,0xbf]), bytes(specimen())]), {nowSeconds: NOW}), /BOM/);
  });
  await check('duplicate JSON fields refuse even when final value is correct', async () => {
    const raw = bytes(specimen()).toString().replace('"scope":"own-guild"', '"scope":"wrong","scope":"own-guild"');
    await assert.rejects(assemble(frameBytes(bytes(raw))), /canonical JSON|duplicate/);
  });
  await check('noncanonical whitespace,escapedASCII and numeric forms refuse', () => {
    const text = bytes(specimen()).toString();
    for (const raw of [' ' + text, text + '\n', text.replace('Synthetic Guild', '\\u0053ynthetic Guild'), text.replace('"online":25', '"online":2.5e1')])
      assert.throws(() => P.validatePayload(bytes(raw), {nowSeconds: NOW}), /canonical JSON/);
  });
  await check('unknown,missing and reordered root and guild fields refuse', () => {
    for (const make of [v => {v.extra = 1;}, v => {delete v.scope;}, v => {const f=v.format;delete v.format;v.format=f;},
      v => {v.guilds[0].extra = 1;}, v => {delete v.guilds[0].online;}, v => {const n=v.guilds[0].name;delete v.guilds[0].name;v.guilds[0].name=n;}]) {
      const value = specimen(); make(value); assert.throws(() => validate(value), /fields/);
    }
  });
  await check('prototype-related extra properties do not bypass closed keys', () => {
    const raw = bytes(specimen()).toString().replace('"guilds":[', '"__proto__":{"polluted":true},"guilds":[');
    assert.throws(() => P.validatePayload(bytes(raw), {nowSeconds: NOW}), /fields/); assert.equal({}.polluted, undefined);
  });
  for (const [key, value] of [['format','olympus-census-v1'], ['scope','all-guilds'], ['source','blizzard'], ['sourceVerified',true],
    ['membershipProof',true], ['addonVersion','0.1.1'], ['faction','Unknown']])
    await rejectsValue('closed contract refuses altered ' + key, v => {v[key] = value;}, /contract|faction/);
  for (const value of ['', ' Guild', 'Guild ', 'A\nB', 'A\u0085B', 'a'.repeat(129)])
    await rejectsValue('guild label refuses ' + JSON.stringify(value).slice(0,45), v => {v.guilds[0].name = value;}, /bounded/);
  for (const value of [[], [{},{}], null]) await rejectsValue('exactly one guild shape ' + JSON.stringify(value), v => {v.guilds = value;}, /one guild/);
  await check('1023-byte input reaches content validation;1024byte input fails byte cap', () => {
    assert.throws(() => P.validatePayload(Buffer.alloc(1023, 0x20), {nowSeconds: NOW}), /UTF-8 JSON/);
    assert.throws(() => P.validatePayload(Buffer.alloc(1024, 0x20), {nowSeconds: NOW}), /byte limit/);
  });
  await check('1024byte independently framed stream is rejected at assembly bound', async () => {
    const frames = frameBytes(Buffer.alloc(1024, 0x20)); assert.equal(frames.length, 14); await assert.rejects(assemble(frames), /byte limit/);
  });
  await check('image preflight retains finite file,header,source and decoded-pixel bounds',()=>{
    assert.equal(P.LIMITS.imageFileBytes,4194304);assert.equal(P.LIMITS.imageHeaderBytes,262144);
    assert.equal(P.LIMITS.imageSourceSide,4096);assert.equal(P.LIMITS.imageSourcePixels,16777216);assert.equal(P.LIMITS.decodedSide,1280);
  });
  await check('PNG dimensions and CRC agree with independent native zlib oracle',()=>{
    assert.deepEqual(inspect(pngHeader(),'image/png'),{width:342,height:342,mime:'image/png'});
    assert.deepEqual(inspect(pngHeader(4096,4096),'image/png'),{width:4096,height:4096,mime:'image/png'});
  });
  await check('actual Lua QR PNG fixture passes header admission when explicitly supplied',()=>{
    if(process.argv[2]) {const raw=fs.readFileSync(process.argv[2]),header=raw.subarray(0,Math.min(raw.length,P.LIMITS.imageHeaderBytes));
      assert.deepEqual(P.inspectImageHeader(header,'image/png',{fileBytes:raw.length}),{width:342,height:342,mime:'image/png'});}
    else assert.deepEqual(inspect(pngHeader(),'image/png'),{width:342,height:342,mime:'image/png'});
  });
  await check('PNG malformed signature,truncated IHDR and altered CRC refuse',()=>{
    const corrupt=pngHeader();corrupt[29]^=1;assert.throws(()=>inspect(corrupt,'image/png'),/checksum/);
    for(const b of [pngHeader().subarray(0,32),Buffer.alloc(33),Buffer.from(pngHeader()).fill(0,8,12)])assert.throws(()=>inspect(b,'image/png'),/IHDR/);
  });
  await check('PNG oversized or zero dimensions refuse before bitmap decode',()=>{
    for(const [w,h] of [[4097,1],[1,4097],[65535,65535],[0,50],[50,0]])assert.throws(()=>inspect(pngHeader(w,h),'image/png'),/dimensions/);
  });
  await check('PNG unsupported compression,filter,interlace and bitdepth refuse',()=>{
    for(const [at,value] of [[24,3],[25,1],[26,1],[27,1],[28,2]]){const b=pngHeader();b[at]=value;b.writeUInt32BE(zlib.crc32(b.subarray(12,29)),29);assert.throws(()=>inspect(b,'image/png'),/fields/);}
  });
  await check('baseline and progressive synthetic JPEG SOF dimensions admit',()=>{
    for(const marker of [0xc0,0xc2])assert.deepEqual(inspect(jpegHeader(640,480,marker),'image/jpeg'),{width:640,height:480,mime:'image/jpeg'});
  });
  await check('JPEG truncated segments,unsupported frames and noSOF refuse',()=>{
    const wrongPrecision=jpegHeader();wrongPrecision[6]=12;
    const badLength=jpegHeader();badLength[5]=255;
    for(const b of [jpegHeader().subarray(0,20),jpegHeader(640,480,0xc1),wrongPrecision,badLength,Buffer.from([255,216,255,218,0,8,1,2,3,4,5,6])])
      assert.throws(()=>inspect(b,'image/jpeg'),/bounded|JPEG|supported/);
    assert.throws(()=>inspect(jpegHeader(4097,10),'image/jpeg'),/dimensions/);
  });
  await check('lossy,lossless and consistent extended synthetic WebP headers admit',()=>{
    for(const b of [webpHeader(),webpHeader(640,480,'VP8L'),webpHeader(640,480,'VP8 ',{})])assert.deepEqual(inspect(b,'image/webp'),{width:640,height:480,mime:'image/webp'});
  });
  await check('animated WebP,canvas mismatch and malformed RIFF bounds refuse',()=>{
    assert.throws(()=>inspect(webpHeader(640,480,'VP8 ',{flags:2}),'image/webp'),/animated/);
    assert.throws(()=>inspect(webpHeader(640,480,'VP8 ',{width:641}),'image/webp'),/disagree/);
    const bad=webpHeader();bad.writeUInt32LE(bad.length,4);assert.throws(()=>inspect(bad,'image/webp'),/RIFF/);
    assert.throws(()=>inspect(webpHeader().subarray(0,25),'image/webp'),/RIFF|truncated/);
    assert.throws(()=>inspect(webpHeader(4097,1),'image/webp'),/dimensions/);
    const version=webpHeader(640,480,'VP8L');version[24]|=0xe0;assert.throws(()=>inspect(version,'image/webp'),/malformed/);
  });
  await check('MIME mismatches and unsupported image formats refuse',()=>{
    for(const [b,mime] of [[pngHeader(),'image/jpeg'],[jpegHeader(),'image/png'],[webpHeader(),'image/png'],[pngHeader(),'image/gif'],[pngHeader(),'image/svg+xml']])
      assert.throws(()=>inspect(b,mime),/signature|IHDR|Only/);
  });
  await check('image header and declared encoded-file-size caps refuse',()=>{
    assert.throws(()=>P.inspectImageHeader(new Uint8Array(262145),'image/png'),/preflight/);
    assert.throws(()=>P.inspectImageHeader(pngHeader(),'image/png',{fileBytes:4194305}),/file size/);
    assert.throws(()=>P.inspectImageHeader(pngHeader(),'image/png',{fileBytes:32}),/file size/);
    assert.throws(()=>P.inspectImageHeader(new Uint8Array(11),'image/png'),/preflight/);
  });
  await check('15parts,zeroindices,out-of-rangeindices and oversizedframes refuse', () => {
    const frame = framesFor()[0];
    for (const changed of [mutateFrame(frame, 4, '015'), mutateFrame(frame, 3, '000'), mutateFrame(frame, 4, '000'),
      mutateFrame(frame, 3, '014'), frame + 'A']) assert.throws(() => P.parseFrame(changed), /sequence|large|canonical/);
  });
  await check('short nonfinal chunks and padded frame bodies refuse', () => {
    const frame = framesFor()[0], fields = frame.split('|');
    assert.throws(() => P.parseFrame(mutateFrame(frame, 5, fields[5].slice(0,96))), /exactly 100/);
    assert.throws(() => P.parseFrame(mutateFrame(frame, 5, fields[5] + '=')), /large|canonical/);
  });
  await check('base64url unused padding bits and wrong alphabet refuse', () => {
    const hash = crypto.createHash('sha256').update('x').digest('base64url'), frame = ['OLCS1',NONCE,hash,'001','001','AA'].join('|');
    assert.doesNotThrow(() => P.parseFrame(frame)); assert.throws(() => P.parseFrame(mutateFrame(frame,5,'AB')), /Noncanonical/);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const last = alphabet.indexOf(hash.at(-1)); assert.equal(last % 4,0);
    assert.throws(() => P.parseFrame(mutateFrame(frame,2,hash.slice(0,-1)+alphabet[last+1])), /Noncanonical/);
    assert.throws(() => P.parseFrame(mutateFrame(frame,5,'+A')), /canonical/);
  });
  await check('wrong namespace and malformed or uppercase nonce cannot enter pilot', () => {
    const frame = framesFor()[0]; assert.throws(() => P.parseFrame(frame.replace('OLCS1','OLG2')), /canonical/);
    assert.throws(() => P.parseFrame(mutateFrame(frame,1,NONCE.toUpperCase())), /canonical/);
    for (const nonce of ['', 'a'.repeat(31), 'g'.repeat(32)]) assert.throws(() => P.createAssembler({nonce}), /nonce/);
  });
  await check('future,negative,fractional and stale observation clocks refuse', () => {
    for (const observedAt of [NOW+1,-1,NOW-86401,1.5,Number.MAX_SAFE_INTEGER+1]) {const v=specimen();v.observedAt=observedAt;assert.throws(()=>validate(v), /Observation/);}
    const v=specimen();v.observedAt=NOW-86400;v.guilds[0].receivedAt=v.observedAt;v.guilds[0].online=null;assert.doesNotThrow(()=>validate(v));
  });
  await check('receivedAt cannot exceed observation or use future/stale/fractional clocks', () => {
    for (const receivedAt of [NOW-9,NOW+1,-1,NOW-86401,1.5]) {const v=specimen();v.guilds[0].receivedAt=receivedAt;assert.throws(()=>validate(v), /Guild observation/);}
  });
  await check('online900seconds inclusive;901seconds requires null at source', () => {
    const v=specimen();v.observedAt=NOW;v.guilds[0].receivedAt=NOW-900;assert.doesNotThrow(()=>validate(v));
    v.guilds[0].receivedAt--;assert.throws(()=>validate(v), /15 minutes/);v.guilds[0].online=null;assert.doesNotThrow(()=>validate(v));
  });
  await check('untrusted local validation clock must be nonnegative safe integer', () => {
    for (const nowSeconds of [NaN,-1,1.5,Infinity]) assert.throws(() => P.validatePayload(bytes(specimen()), {nowSeconds}), /clock/);
  });
  await check('small guild totals require few and fully withheld online', () => {
    const v=specimen();v.guilds[0].reportedCharacters='few';v.guilds[0].online=null;assert.doesNotThrow(()=>validate(v));
    for(const online of [0,'few',5]) {v.guilds[0].online=online;assert.throws(()=>validate(v), /Small guild/);}
    for(const count of [0,1,2,3,4,1001,-1,5.5,true,null,'100']) {const t=specimen();t.guilds[0].reportedCharacters=count;assert.throws(()=>validate(t), /character count/);}
  });
  await check('online few,null,zero and5plus accepted without complementary leak', () => {
    const v=specimen();for(const online of ['few',null,0,5,95,100]) {v.guilds[0].online=online;assert.doesNotThrow(()=>validate(v));}
    for(const online of [1,2,3,4,-1,101,5.5,true,'25']) {v.guilds[0].online=online;assert.throws(()=>validate(v), /Online count/);}
  });
  await check('small nonzero offline remainders1through4 forbid exact online', () => {
    for(let gap=1;gap<=4;gap++) {const v=specimen();v.guilds[0].reportedCharacters=5+gap;v.guilds[0].online=5;assert.throws(()=>validate(v), /offline remainder/);v.guilds[0].online=null;assert.doesNotThrow(()=>validate(v));}
    const v=specimen();v.guilds[0].reportedCharacters=100;v.guilds[0].online=95;assert.doesNotThrow(()=>validate(v));
  });
  console.log('\n' + passed + ' passed, ' + failed + ' failed'); if (failed) process.exitCode=1;
})().catch(error => {console.error(error.stack);process.exitCode=1;});

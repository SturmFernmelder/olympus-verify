(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OlympusGuildQRProtocol = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const LIMITS = Object.freeze({ payloadBytes: 1023, parts: 14, frameBytes: 191, chunkCharacters: 100, captureMs: 30000, reviewMs: 900000, sourceAgeSeconds: 86400, onlineAgeSeconds: 900, imageHeaderBytes: 262144, imageFileBytes: 4194304, imageSourceSide: 4096, imageSourcePixels: 16777216, decodedSide: 1280 });
  const ROOT_KEYS = ['format', 'scope', 'source', 'sourceVerified', 'membershipProof', 'addonVersion', 'realmGroup', 'faction', 'observedAt', 'guilds'];
  const ROW_KEYS = ['name', 'receivedAt', 'reportedCharacters', 'online'];
  const encoder = new TextEncoder();
  function refuse(message) { throw new Error(message); }
  function exactKeys(value, keys, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).join('|') !== keys.join('|')) refuse(label + ' has unknown, missing or out-of-order fields.');
  }
  function base64url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromBase64url(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) refuse('Invalid base64url data.');
    let decoded;
    try { decoded = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)); }
    catch (_) { refuse('Invalid base64url data.'); }
    const bytes = Uint8Array.from(decoded, c => c.charCodeAt(0));
    if (base64url(bytes) !== value) { bytes.fill(0); refuse('Noncanonical base64url data.'); }
    return bytes;
  }
  function validNonce(nonce) { if (typeof nonce !== 'string' || !/^[0-9a-f]{32}$/.test(nonce)) refuse('Invalid local scan nonce.'); }
  function inspectImageHeader(bytes, mime, options) {
    options = options || {};
    if (!(bytes instanceof Uint8Array) || bytes.length < 12 || bytes.length > LIMITS.imageHeaderBytes) refuse('Image header is missing or exceeds the bounded preflight.');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) refuse('Only PNG, JPEG and WebP images are accepted.');
    const fileBytes = options.fileBytes === undefined ? null : options.fileBytes;
    if (fileBytes !== null && (!Number.isSafeInteger(fileBytes) || fileBytes < bytes.length || fileBytes > LIMITS.imageFileBytes)) refuse('Image file size is outside the local limit.');
    const u16be = p => bytes[p] * 256 + bytes[p + 1];
    const u16le = p => bytes[p] + bytes[p + 1] * 256;
    const u24le = p => bytes[p] + bytes[p + 1] * 256 + bytes[p + 2] * 65536;
    const u32be = p => bytes[p] * 16777216 + bytes[p + 1] * 65536 + bytes[p + 2] * 256 + bytes[p + 3];
    const u32le = p => bytes[p] + bytes[p + 1] * 256 + bytes[p + 2] * 65536 + bytes[p + 3] * 16777216;
    const ascii = (p, text) => Array.from(text).every((c, i) => bytes[p + i] === c.charCodeAt(0));
    function dimensions(width, height) {
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > LIMITS.imageSourceSide || height > LIMITS.imageSourceSide || width * height > LIMITS.imageSourcePixels) refuse('Image dimensions exceed the 4096-side / 16-megapixel local limit.');
      return Object.freeze({ width, height, mime });
    }
    if (mime === 'image/png') {
      const signature = [137, 80, 78, 71, 13, 10, 26, 10];
      if (!signature.every((value, i) => bytes[i] === value) || bytes.length < 33 || u32be(8) !== 13 || !ascii(12, 'IHDR')) refuse('PNG must begin with a complete canonical IHDR.');
      const depth = bytes[24], color = bytes[25];
      const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!depths[color] || !depths[color].includes(depth) || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] > 1) refuse('PNG IHDR contains unsupported or malformed fields.');
      let crc = 0xffffffff;
      for (let p = 12; p < 29; p++) {
        crc ^= bytes[p];
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
      if (((crc ^ 0xffffffff) >>> 0) !== u32be(29)) refuse('PNG IHDR checksum is invalid.');
      return dimensions(u32be(16), u32be(20));
    }
    if (mime === 'image/jpeg') {
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) refuse('JPEG signature does not match the selected file type.');
      let p = 2;
      while (p < bytes.length) {
        if (bytes[p++] !== 0xff) refuse('JPEG header marker is malformed.');
        while (p < bytes.length && bytes[p] === 0xff) p++;
        if (p >= bytes.length) refuse('JPEG header is truncated.');
        const marker = bytes[p++];
        if (marker === 0 || marker === 0xd8 || marker === 0xd9 || marker === 0xda || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) refuse('JPEG has no supported bounded dimensions before image data.');
        if (p + 2 > bytes.length) refuse('JPEG segment length is truncated.');
        const length = u16be(p), end = p + length;
        if (length < 2 || end > bytes.length || (fileBytes !== null && end > fileBytes)) refuse('JPEG header segment exceeds the bounded preflight.');
        const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
        if (isFrame) {
          if (![0xc0, 0xc2].includes(marker) || length < 11 || bytes[p + 2] !== 8 || ![1, 3].includes(bytes[p + 7]) || length !== 8 + 3 * bytes[p + 7]) refuse('Only bounded 8-bit baseline or progressive JPEG headers are accepted.');
          return dimensions(u16be(p + 5), u16be(p + 3));
        }
        p = end;
      }
      refuse('JPEG dimensions were not found in the bounded header.');
    }
    if (!ascii(0, 'RIFF') || !ascii(8, 'WEBP')) refuse('WebP signature does not match the selected file type.');
    const riffEnd = u32le(4) + 8;
    if (riffEnd < 20 || riffEnd > LIMITS.imageFileBytes || (fileBytes !== null && riffEnd !== fileBytes)) refuse('WebP RIFF bounds are malformed.');
    let p = 12, canvas = null;
    while (p + 8 <= bytes.length && p + 8 <= riffEnd) {
      const length = u32le(p + 4), begin = p + 8, end = begin + length, paddedEnd = end + (length & 1);
      if (end > riffEnd || paddedEnd > riffEnd) refuse('WebP chunk exceeds its RIFF bounds.');
      if (ascii(p, 'ANIM') || ascii(p, 'ANMF')) refuse('Animated WebP is outside the screenshot pilot.');
      if (ascii(p, 'VP8X')) {
        if (p !== 12 || canvas || length !== 10 || end > bytes.length || (bytes[begin] & 0xc3) !== 0 || bytes[begin + 1] || bytes[begin + 2] || bytes[begin + 3]) refuse('WebP extended header is malformed or animated.');
        canvas = dimensions(u24le(begin + 4) + 1, u24le(begin + 7) + 1);
      } else if (ascii(p, 'VP8 ') || ascii(p, 'VP8L')) {
        let result;
        if (ascii(p, 'VP8 ')) {
          if (length < 10 || begin + 10 > bytes.length || (bytes[begin] & 1) !== 0 || ![157, 1, 42].every((value, i) => bytes[begin + 3 + i] === value)) refuse('WebP lossy frame header is malformed or truncated.');
          result = dimensions(u16le(begin + 6) & 0x3fff, u16le(begin + 8) & 0x3fff);
        } else {
          if (length < 5 || begin + 5 > bytes.length || bytes[begin] !== 0x2f || (bytes[begin + 4] & 0xe0) !== 0) refuse('WebP lossless frame header is malformed or truncated.');
          const bits = u32le(begin + 1);
          result = dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
        }
        if (canvas && (canvas.width !== result.width || canvas.height !== result.height)) refuse('WebP canvas and coded frame dimensions disagree.');
        return result;
      }
      if (paddedEnd > bytes.length) refuse('WebP dimensions lie beyond the bounded header preflight.');
      p = paddedEnd;
    }
    refuse('WebP coded frame dimensions were not found in the bounded header.');
  }
  function parseFrame(text) {
    if (typeof text !== 'string' || text.length > LIMITS.frameBytes) refuse('The pilot frame is too large.');
    const match = /^OLCS1\|([0-9a-f]{32})\|([A-Za-z0-9_-]{43})\|(\d{3})\|(\d{3})\|([A-Za-z0-9_-]{1,100})$/.exec(text);
    if (!match) refuse('This is not a canonical OLCS1 pilot frame.');
    const part = Number(match[3]), total = Number(match[4]);
    if (part < 1 || total < 1 || total > LIMITS.parts || part > total) refuse('Invalid pilot frame sequence.');
    if (part < total && match[5].length !== LIMITS.chunkCharacters) refuse('A nonfinal pilot chunk must contain exactly 100 characters.');
    const hash = fromBase64url(match[2]);
    if (hash.length !== 32) { hash.fill(0); refuse('Invalid payload hash.'); }
    hash.fill(0);
    const chunk = fromBase64url(match[5]);
    chunk.fill(0);
    return Object.freeze({ nonce: match[1], hash: match[2], part, total, chunk: match[5] });
  }
  function label(value, name) {
    if (typeof value !== 'string' || !value || value.trim() !== value || /[\u0000-\u001f\u007f-\u009f]/.test(value) || encoder.encode(value).length > 128) refuse(name + ' is not a bounded guild label.');
    // JSON.stringify would otherwise replace malformed UTF-16 before validation.
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) { if (++i >= value.length || value.charCodeAt(i) < 0xdc00 || value.charCodeAt(i) > 0xdfff) refuse(name + ' has invalid Unicode.'); }
      else if (c >= 0xdc00 && c <= 0xdfff) refuse(name + ' has invalid Unicode.');
    }
  }
  function validatePayload(bytes, options) {
    options = options || {};
    const now = options.nowSeconds === undefined ? Math.floor(Date.now() / 1000) : options.nowSeconds;
    if (!Number.isSafeInteger(now) || now < 0) refuse('Local clock is unavailable.');
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > LIMITS.payloadBytes) refuse('Payload exceeds the one-guild byte limit.');
    if (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) refuse('Payload must be canonical UTF-8 without a BOM.');
    let text, value;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); value = JSON.parse(text); }
    catch (_) { refuse('Payload is not valid UTF-8 JSON.'); }
    exactKeys(value, ROOT_KEYS, 'Payload');
    if (value.format !== 'olympus-stat-observation-v1' || value.scope !== 'own-guild' || value.source !== 'volunteer-client' || value.sourceVerified !== false || value.membershipProof !== false || value.addonVersion !== '0.1.0') refuse('Payload is outside the local observation contract.');
    label(value.realmGroup, 'Realm group');
    if (value.faction !== 'Alliance' && value.faction !== 'Horde') refuse('Unknown faction.');
    if (!Number.isSafeInteger(value.observedAt) || value.observedAt < 0 || value.observedAt > now || now - value.observedAt > LIMITS.sourceAgeSeconds) refuse('Observation is future-dated or older than 24 hours by this local clock.');
    if (!Array.isArray(value.guilds) || value.guilds.length !== 1) refuse('The pilot accepts exactly one guild.');
    const guild = value.guilds[0];
    exactKeys(guild, ROW_KEYS, 'Guild');
    label(guild.name, 'Guild name');
    if (!Number.isSafeInteger(guild.receivedAt) || guild.receivedAt < 0 || guild.receivedAt > value.observedAt || now - guild.receivedAt > LIMITS.sourceAgeSeconds) refuse('Guild observation time is unavailable, future-dated or too old.');
    const members = guild.reportedCharacters;
    if (members !== 'few' && (!Number.isSafeInteger(members) || members < 5 || members > 1000)) refuse('Reported character count is outside the masked-count contract.');
    const online = guild.online;
    if (members === 'few' && online !== null) refuse('Small guild totals must withhold online counts.');
    if (online !== null && online !== 'few' && (!Number.isSafeInteger(online) || (online !== 0 && online < 5) || online > members)) refuse('Online count is outside the masked-count contract.');
    if (Number.isSafeInteger(members) && Number.isSafeInteger(online) && online >= 5 && members - online >= 1 && members - online <= 4) refuse('Online count must be withheld when it would reveal a small nonzero offline remainder.');
    if (now - guild.receivedAt > LIMITS.onlineAgeSeconds && online !== null) refuse('Online counts older than 15 minutes must be withheld by the source.');
    if (JSON.stringify(value) !== text) refuse('Payload is not canonical JSON, or contains duplicate fields.');
    Object.freeze(guild); Object.freeze(value.guilds); Object.freeze(value);
    return value;
  }
  async function digest(bytes) {
    if (!globalThis.crypto || !globalThis.crypto.subtle) refuse('A secure local browser origin is required.');
    return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  }
  function createAssembler(options) {
    options = options || {}; validNonce(options.nonce);
    const nonce = options.nonce;
    const clock = typeof options.clock === 'function' ? options.clock : Date.now;
    const startedAt = clock();
    if (!Number.isSafeInteger(startedAt) || startedAt < 0) refuse('Local clock is unavailable.');
    let lastTime = startedAt, live = true, busy = false, expectedHash = null, expectedTotal = null, generation = 0;
    const parts = new Map();
    function clear() { live = false; generation++; parts.clear(); expectedHash = null; expectedTotal = null; }
    function time() {
      const current = clock();
      if (!Number.isSafeInteger(current) || current < lastTime) { clear(); refuse('Local clock moved backwards. Start a new scan.'); }
      lastTime = current;
      if (current - startedAt >= LIMITS.captureMs) { clear(); refuse('The 30-second scan expired. Start a new scan.'); }
      return current;
    }
    async function add(text) {
      if (!live) refuse('This local scan has ended.');
      if (busy) { clear(); refuse('A frame is already being verified.'); }
      let bytes = null, hash = null;
      const ownGeneration = generation;
      try {
        time();
        const frame = parseFrame(text);
        if (frame.nonce !== nonce) refuse('This frame belongs to another scan.');
        if (expectedHash !== null && (expectedHash !== frame.hash || expectedTotal !== frame.total)) refuse('Mixed snapshot frames were refused.');
        expectedHash = frame.hash; expectedTotal = frame.total;
        if (parts.has(frame.part) && parts.get(frame.part) !== frame.chunk) refuse('Conflicting duplicate frame was refused.');
        parts.set(frame.part, frame.chunk);
        if (parts.size !== expectedTotal) return Object.freeze({ status: 'pending', received: parts.size, total: expectedTotal });
        busy = true;
        let encoded = '';
        for (let part = 1; part <= expectedTotal; part++) encoded += parts.get(part);
        if (encoded.length > Math.ceil(LIMITS.payloadBytes * 4 / 3)) refuse('Payload exceeds the one-guild byte limit.');
        bytes = fromBase64url(encoded); encoded = '';
        if (bytes.length > LIMITS.payloadBytes) refuse('Payload exceeds the one-guild byte limit.');
        hash = await digest(bytes);
        if (!live || generation !== ownGeneration) refuse('This local scan was cancelled.');
        const now = time();
        if (base64url(hash) !== expectedHash) refuse('Payload checksum does not match.');
        const payload = validatePayload(bytes, { nowSeconds: Math.floor(now / 1000) });
        const total = expectedTotal;
        clear();
        return Object.freeze({ status: 'complete', received: total, total, payload });
      } catch (error) { clear(); throw error; }
      finally { busy = false; if (bytes) bytes.fill(0); if (hash) hash.fill(0); }
    }
    return Object.freeze({ add, clear, get progress() { return Object.freeze({ received: parts.size, total: expectedTotal }); } });
  }
  async function encodeFrames(payload, nonce, options) {
    validNonce(nonce);
    const bytes = encoder.encode(JSON.stringify(payload));
    try {
      validatePayload(bytes, options);
      const hashBytes = await digest(bytes);
      const hash = base64url(hashBytes); hashBytes.fill(0);
      const encoded = base64url(bytes), total = Math.ceil(encoded.length / LIMITS.chunkCharacters), frames = [];
      if (total > LIMITS.parts) refuse('Payload requires too many frames.');
      for (let i = 0; i < total; i++) frames.push('OLCS1|' + nonce + '|' + hash + '|' + String(i + 1).padStart(3, '0') + '|' + String(total).padStart(3, '0') + '|' + encoded.slice(i * LIMITS.chunkCharacters, (i + 1) * LIMITS.chunkCharacters));
      return Object.freeze(frames);
    } finally { bytes.fill(0); }
  }
  return Object.freeze({ LIMITS, parseFrame, validatePayload, createAssembler, encodeFrames, base64url, fromBase64url, inspectImageHeader });
}));

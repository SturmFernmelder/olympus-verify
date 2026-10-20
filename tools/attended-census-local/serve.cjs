#!/usr/bin/env node
'use strict';
// Explicit attended loopback process. No Worker, provider, configuration or disk data bindings.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { isAsyncFunction } = require('node:util').types;
const protocol = require('../guild-qr-pilot/protocol.js');
const { createCensusStore, FIXTURES, LOCAL_REAL_CONSENT_VERSION, FORMAT, parseStrictJSON } = require('../shared-census-lab/core.cjs');
const PILOT = path.resolve(__dirname, '../guild-qr-pilot');
const FILES = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/pilot.js': ['pilot.js', 'text/javascript; charset=utf-8'],
  '/pilot.css': ['pilot.css', 'text/css; charset=utf-8'],
  '/protocol.js': ['protocol.js', 'text/javascript; charset=utf-8'],
  '/decoder.js': ['decoder.js', 'text/javascript; charset=utf-8'],
  '/vendor/jsqr-1.4.0.js': ['vendor/jsqr-1.4.0.js', 'text/javascript; charset=utf-8'],
  '/vendor/jsqr-1.4.0.LICENSE.txt': ['vendor/jsqr-1.4.0.LICENSE.txt', 'text/plain; charset=utf-8'],
  '/vendor/NOTICE.txt': ['vendor/NOTICE.txt', 'text/plain; charset=utf-8']
});
const HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; media-src blob:; worker-src 'self'; connect-src 'self'; manifest-src 'none'",
  'Permissions-Policy': 'camera=(self), display-capture=(self), microphone=(), geolocation=(), payment=(), usb=()',
  'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex, nofollow'
});
const opaque = value => typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
const token = () => crypto.randomBytes(24).toString('hex');
const id = () => crypto.randomBytes(16).toString('hex');
const fail = (code, status = 400) => Object.assign(new Error(code), { code, status });
function closed(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) throw fail('closed_body_required');
  return value;
}
function createAttendedServer(options = {}) {
  const parentKeys = ['origin', 'admit', 'guard'], hasParent = parentKeys.some(key => Object.hasOwn(options, key));
  if (hasParent && parentKeys.some(key => typeof options[key] !== 'function') || hasParent && isAsyncFunction(options.guard)) throw TypeError('Parent origin, async admission and synchronous guard must be supplied together');
  if (Object.hasOwn(options, 'embeddedLocal') && typeof options.embeddedLocal !== 'boolean' || options.embeddedLocal === true && !hasParent) throw TypeError('Embedded local mode requires all parent hooks');
  const wall = options.now || Date.now, mono = options.monotonicNow || (() => performance.now());
  const overlay = options.overlay || require('./overlay.cjs');
  if (typeof wall !== 'function' || typeof mono !== 'function' || typeof overlay.renderHTML !== 'function' || typeof overlay.renderPilot !== 'function') throw TypeError('Attended local clock and overlay required');
  let port = 0, closing = false, store = null, registered = null, lastWall = 0, lastMono = 0;
  const sessions = new Map(), scans = new Map(), previews = new Map(), intents = new Map(), receipts = new Map();
  const counters = { requests: 0, scansCreated: 0, decodedPreviews: 0, submissions: 0, cancellations: 0 };
  function clock() {
    const at = wall(), monotonic = mono();
    if (!Number.isSafeInteger(at) || at < lastWall || !Number.isFinite(monotonic) || monotonic < lastMono || at < 0 || monotonic < 0) throw fail('local_clock_refused', 503);
    lastWall = at; lastMono = monotonic; return { at, monotonic };
  }
  const origin = () => {
    const value = hasParent ? options.origin() : `http://127.0.0.1:${port}`;
    let parsed; try { parsed = new URL(value); } catch { throw fail('loopback_origin_required', 503); }
    if (typeof value !== 'string' || value !== parsed.origin || parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/' || parsed.username || parsed.password || parsed.search || parsed.hash) throw fail('loopback_origin_required', 503);
    return parsed.origin;
  };
  const headers = options.embeddedLocal === true ? Object.freeze({ ...HEADERS,
    'Content-Security-Policy': HEADERS['Content-Security-Policy'].replace("frame-ancestors 'none'", "frame-ancestors 'self'"),
    'X-Frame-Options': 'SAMEORIGIN' }) : HEADERS;
  function send(req, res, status, value, extra = {}, type = 'application/json; charset=utf-8') {
    if (res.destroyed || req.aborted) return;
    if (status < 400) current(req, res);
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(type.startsWith('application/json') ? JSON.stringify(value) : value);
    res.writeHead(status, { ...headers, 'Content-Type': type, 'Content-Length': bytes.length, ...extra });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  }
  function dropScan(scanId) { const scan = scans.get(scanId); if (scan) { clearTimeout(scan.timer); scan.assembler?.clear(); scan.assembler = null; scans.delete(scanId); } }
  function clearReport(intent) { if (intent.report) intent.report.fill(0); intent.report = null; if (intent.timer) clearTimeout(intent.timer); intent.timer = null; }
  function dropPreview(previewId) { const preview = previews.get(previewId); if (preview) { clearTimeout(preview.timer); preview.payload = null; preview.observation = null; previews.delete(previewId); } for (const intent of intents.values()) if (intent.previewId === previewId) clearReport(intent); }
  function clearPending(owner) { for (const [key, scan] of scans) if (scan.owner === owner) dropScan(key); for (const [key, preview] of previews) if (preview.owner === owner) dropPreview(key); }
  function retireSession(key) { clearPending(key); sessions.delete(key); }
  function prune() {
    const time = clock();
    for (const [key, session] of sessions) if (time.at >= session.expiresAt || time.monotonic >= session.monoExpires) retireSession(key);
    for (const [key, scan] of scans) if (time.at >= scan.expiresAt || time.monotonic >= scan.monoExpires || !sessions.has(scan.owner)) dropScan(key);
    for (const [key, preview] of previews) if (Math.floor(time.at / 1000) >= preview.expiresAt || time.monotonic >= preview.monoExpires || !sessions.has(preview.owner)) dropPreview(key);
    for (const [key, intent] of intents) {
      if (intent.report && (time.at >= intent.expiresAt || time.monotonic >= intent.monoExpires)) clearReport(intent);
      if (time.at >= intent.issuedAt + 86400000) { clearReport(intent); intents.delete(key); }
    }
    for (const [key, receipt] of receipts) if (time.at >= receipt.issuedAt + 86400000) receipts.delete(key);
    return time;
  }
  function cookieToken(req) { const values = (req.headers.cookie || '').split(';').map(value => value.trim()).filter(value => value.startsWith('census_local=')); return values.length === 1 && /^census_local=[0-9a-f]{48}$/.test(values[0]) ? values[0].slice(13) : null; }
  function sessionFor(req, expected) {
    const time = prune(), session = sessions.get(cookieToken(req));
    if (!session || expected && session !== expected || time.at >= session.expiresAt || time.monotonic >= session.monoExpires) throw fail('original_local_session_required', 401);
    return session;
  }
  function newSession(fixture = 'reporterA') {
    const time = prune(); if (!Object.hasOwn(FIXTURES, fixture)) throw fail('fixture_refused');
    if (sessions.size >= 8) throw fail('local_session_capacity', 429);
    const session = { token: token(), csrf: token(), fixture, ctx: { ...FIXTURES[fixture] }, expiresAt: time.at + 3600000, monoExpires: time.monotonic + 3600000, rate: [] };
    sessions.set(session.token, session); return session;
  }
  const cookie = session => `census_local=${session.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`;
  const identity = session => ({ fixture: session.fixture, reporterIdentitySynthetic: true, canReport: session.fixture !== 'reader', realAccountAssociated: false });
  function reporter(session) { if (session.fixture === 'reader') throw fail('reporter_required', 403); if (store && !store.contract(session.ctx).canReport) throw fail('reporter_required', 403); }
  function current(req, res, session) {
    if (closing || req.aborted || res.destroyed) throw fail('request_ended', 409);
    if (hasParent) {
      const result = options.guard(req);
      if (result && typeof result.then === 'function') { Promise.resolve(result).catch(() => {}); throw fail('synchronous_parent_guard_required', 503); }
      if (result === false) throw fail('parent_admission_required', 403);
    }
    if (session) sessionFor(req, session);
  }
  async function admit(req, res, session) {
    current(req, res, session);
    if (hasParent && await options.admit(req) === false) throw fail('parent_admission_required', 403);
    current(req, res, session);
  }
  function ownedPreview(session, previewId) {
    prune(); const preview = previews.get(previewId);
    if (!opaque(previewId) || !preview || preview.owner !== session.token) throw fail('own_preview_required', 404);
    return preview;
  }
  function ownedIntent(session, intentId) { const intent = intents.get(intentId); if (!opaque(intentId) || !intent || intent.owner !== session.token) throw fail('own_intent_required', 404); return intent; }
  function rate(session) { const time = clock().at; session.rate = session.rate.filter(at => time - at < 60000); if (session.rate.length >= 120) throw fail('local_request_limit', 429); session.rate.push(time); }
  async function body(req) {
    if (req.headers['content-type'] !== 'application/json') throw fail('json_required', 415);
    if (req.headers['content-encoding'] || req.headers['transfer-encoding'] && req.headers['transfer-encoding'] !== 'chunked') throw fail('encoded_body_refused', 415);
    if (req.headers['content-length'] && (!/^\d+$/.test(req.headers['content-length']) || Number(req.headers['content-length']) > 4096)) { req.resume(); throw fail('body_size', 413); }
    const bytes = await new Promise((resolve, reject) => {
      const chunks = []; let size = 0, done = false;
      const timer = setTimeout(() => finish(fail('body_timeout', 408)), 5000); timer.unref();
      function finish(error) { if (done) return; done = true; clearTimeout(timer); if (error) { req.resume(); reject(error); } else resolve(Buffer.concat(chunks)); }
      req.on('data', value => { if (done) return; size += value.length; if (size > 4096) { finish(fail('body_size', 413)); return; } chunks.push(value); });
      req.on('end', () => finish()); req.on('aborted', () => finish(fail('request_ended', 409))); req.on('error', () => finish(fail('request_ended', 409)));
    });
    try { return parseStrictJSON(bytes); } finally { bytes.fill(0); }
  }
  function state(session) {
    const own = [];
    if (store) for (const [key, owner] of receipts) if (owner.owner === session.token) { try { own.push(store.receipt(session.ctx, key)); } catch (error) { if (![403, 404, 409, 410].includes(error.status)) throw error; } }
    return { localOnly: true, syntheticOnly: false, reporterIdentitySynthetic: true, csrf: session.csrf, identity: identity(session), contract: store ? store.contract(session.ctx) : null, summary: store ? store.summary(session.ctx) : null, receipts: own };
  }
  function status() { prune(); return { localOnly: true, syntheticOnly: false, inMemory: true, providerRequests: 0, productionBindings: false, activeSessions: sessions.size, activeScans: scans.size, activePreviews: previews.size, intentHandles: intents.size, pendingReportBuffers: [...intents.values()].filter(intent => intent.report !== null).length, receiptHandles: receipts.size, guildRegistrations: registered ? 1 : 0, ...counters, census: store ? store.inspect() : null }; }
  const handler = async (req, res) => {
    counters.requests++;
    try {
      if (closing) throw fail('local_process_closing', 503);
      if (req.headers.host !== new URL(origin()).host) throw fail('loopback_host_required', 403);
      if (!req.url || !req.url.startsWith('/') || req.url.startsWith('//') || req.url.includes('\\') || req.url.includes('?') || req.url.includes('#')) throw fail('exact_path_required', 400);
      if (req.headers.origin && req.headers.origin !== origin()) throw fail('local_origin_required', 403);
      // A containing website's original admission time belongs to this same request budget.
      const parentStarted = hasParent && req.method === 'POST' ? clock() : null;
      if (hasParent) await admit(req, res);
      if (['GET', 'HEAD'].includes(req.method) && (Object.hasOwn(FILES, req.url) || ['/bridge.js', '/local.css'].includes(req.url))) {
        let bytes, type;
        if (Object.hasOwn(FILES, req.url)) { const file = FILES[req.url]; type = file[1]; bytes = fs.readFileSync(path.join(PILOT, file[0])); if (req.url === '/') bytes = Buffer.from(overlay.renderHTML(bytes.toString('utf8'))); if (req.url === '/pilot.js') bytes = Buffer.from(overlay.renderPilot(bytes.toString('utf8'))); }
        else { type = req.url.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8'; bytes = fs.readFileSync(path.join(__dirname, req.url.slice(1))); }
        send(req, res, 200, bytes, {}, type); return;
      }
      if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) throw fail('cross_site_refused', 403);
      if (!['GET', 'POST'].includes(req.method)) { req.resume(); throw fail('method_refused', 405); }
      if (req.method === 'GET' && req.url === '/local/status') { send(req, res, 200, status()); return; }
      if (req.method === 'GET' && req.url === '/local/session') {
        let session; try { session = sessionFor(req); } catch (error) { if (error.code !== 'original_local_session_required') throw error; session = newSession(); }
        send(req, res, 200, { localOnly: true, syntheticOnly: false, csrf: session.csrf, identity: identity(session) }, { 'Set-Cookie': cookie(session) }); return;
      }
      const session = sessionFor(req); rate(session);
      if (req.method === 'GET' && req.url === '/local/state') { send(req, res, 200, state(session)); return; }
      if (req.method !== 'POST') throw fail('local_route_not_found', 404);
      if (req.headers.origin !== origin()) throw fail('local_origin_required', 403);
      if (req.headers['x-census-csrf'] !== session.csrf) throw fail('csrf_required', 403);
      // The original start budget includes body receipt, verification and handoff.
      const started = parentStarted || clock(), value = await body(req);
      if (hasParent) await admit(req, res, session); else current(req, res, session);
      if (req.url === '/local/identity') {
        closed(value, ['fixture']); if (!Object.hasOwn(FIXTURES, value.fixture)) throw fail('fixture_refused'); retireSession(session.token); const next = newSession(value.fixture); send(req, res, 200, state(next), { 'Set-Cookie': cookie(next) }); return;
      }
      if (req.url === '/local/cancel') { closed(value, []); clearPending(session.token); counters.cancellations++; send(req, res, 200, { localOnly: true, syntheticOnly: false, state: 'cancelled' }); return; }
      if (req.url === '/local/start') {
        closed(value, []); reporter(session); clearPending(session.token);
        const time = clock(); if (time.at - started.at >= 30000 || time.monotonic - started.monotonic >= 30000) throw fail('scan_expired', 409);
        const scanId = id(), nonce = id(), scan = { owner: session.token, nonce, startedAt: started.at, expiresAt: started.at + 30000, monoExpires: started.monotonic + 30000, busy: false, assembler: null };
        scans.set(scanId, scan); scan.timer = setTimeout(() => dropScan(scanId), Math.max(1, 30000 - (time.monotonic - started.monotonic))); scan.timer.unref(); counters.scansCreated++;
        send(req, res, 201, { localOnly: true, syntheticOnly: false, scanId, nonce, expiresAt: scan.expiresAt }); return;
      }
      if (req.url === '/local/preview') {
        closed(value, ['scanId', 'frames']); reporter(session); const scan = scans.get(value.scanId);
        if (!opaque(value.scanId) || !scan || scan.owner !== session.token) throw fail('own_scan_required', 404);
        if (scan.busy) throw fail('scan_busy', 409);
        if (!Array.isArray(value.frames) || value.frames.length < 1 || value.frames.length > protocol.LIMITS.parts || value.frames.some(frame => typeof frame !== 'string' || Buffer.byteLength(frame, 'utf8') > protocol.LIMITS.frameBytes)) { dropScan(value.scanId); throw fail('frames_required'); }
        scan.busy = true;
        try {
          const parts = value.frames.map(frame => protocol.parseFrame(frame));
          if (new Set(parts.map(frame => frame.part)).size !== parts.length || parts.some(frame => frame.total !== parts.length)) throw fail('complete_unique_frames_required');
          // The unchanged assembler has its own canonical, checksum, freshness and masking fences.
          let firstClock = true;
          scan.assembler = protocol.createAssembler({ nonce: scan.nonce, clock: () => { if (firstClock) { firstClock = false; return scan.startedAt; } return clock().at; } });
          let complete; for (const frame of value.frames) { complete = await scan.assembler.add(frame); if (hasParent) current(req, res, session); }
          if (hasParent) await admit(req, res, session); else current(req, res, session);
          const verifiedTime = clock();
          if (scans.get(value.scanId) !== scan || verifiedTime.at >= scan.expiresAt || verifiedTime.monotonic >= scan.monoExpires) throw fail('scan_expired', 409);
          if (complete?.status !== 'complete') throw fail('complete_frames_required');
          const payload = complete.payload, guild = payload.guilds[0], scope = { guildKey: 'local-own-guild', label: guild.name, realmGroup: payload.realmGroup, faction: payload.faction, product: 'local-only' };
          const capturedAt = Math.floor(verifiedTime.at / 1000), expiresAt = Math.min(capturedAt + 300, Math.floor(scan.startedAt / 1000) + 900, guild.receivedAt + 86400, payload.observedAt + 86400);
          if (capturedAt >= expiresAt) throw fail('source_expired', 409);
          if (registered && ['label', 'realmGroup', 'faction'].some(key => registered[key] !== scope[key])) throw fail('one_guild_scope_required', 409);
          if (!store) { store = createCensusStore({ now: () => Math.floor(clock().at / 1000), localRealGuild: scope }); registered = Object.freeze(scope); }
          const previewId = id(), observation = Object.freeze({ format: FORMAT, source: 'unverified-volunteer-client', sourceVerified: false, membershipProof: false, guildKey: 'local-own-guild', addonVersion: payload.addonVersion, observedAt: payload.observedAt, sourceReceivedAt: guild.receivedAt, capturedAt, completeRosterClaimed: true, reportedCharacters: guild.reportedCharacters, reportedOnline: guild.online });
          const preview = { owner: session.token, payload, observation, expiresAt, monoExpires: verifiedTime.monotonic + (expiresAt * 1000 - verifiedTime.at) };
          previews.set(previewId, preview); preview.timer = setTimeout(() => dropPreview(previewId), Math.max(1, expiresAt * 1000 - verifiedTime.at)); preview.timer.unref(); counters.decodedPreviews++;
          send(req, res, 201, { localOnly: true, syntheticOnly: false, reporterIdentitySynthetic: true, previewId, expiresAt, contract: store.contract(session.ctx), payload }); return;
        } catch (error) { if (!error.status && error.name === 'Error') throw fail('qr_payload_refused'); throw error; }
        finally { dropScan(value.scanId); value.frames.fill(''); }
      }
      if (req.url === '/local/intent') {
        closed(value, ['previewId', 'consentVersion']); reporter(session); const preview = ownedPreview(session, value.previewId);
        if (value.consentVersion !== LOCAL_REAL_CONSENT_VERSION) throw fail('consent_required');
        current(req, res, session);
        const issued = store.createIntent(session.ctx, { guildKey: 'local-own-guild', consentVersion: value.consentVersion });
        const report = Buffer.from(JSON.stringify({ ...preview.observation, intent: issued.intent })), time = clock();
        const pending = { owner: session.token, previewId: value.previewId, report, issuedAt: time.at, expiresAt: Math.min(issued.expiresAt, preview.expiresAt) * 1000, monoExpires: Math.min(preview.monoExpires, time.monotonic + 300000), receiptId: null, timer: null };
        pending.timer = setTimeout(() => clearReport(pending), Math.max(1, Math.min(pending.expiresAt - time.at, pending.monoExpires - time.monotonic))); pending.timer.unref();
        intents.set(issued.intent, pending); send(req, res, 201, issued); return;
      }
      if (req.url === '/local/submit') {
        closed(value, ['previewId', 'intent']); reporter(session); const intent = ownedIntent(session, value.intent);
        if (intent.previewId !== value.previewId) throw fail('intent_preview_binding', 409);
        if (intent.receiptId) { send(req, res, 200, store.receipt(session.ctx, intent.receiptId)); return; }
        ownedPreview(session, value.previewId); if (!intent.report) throw fail('intent_payload_expired', 409);
        current(req, res, session);
        const receipt = store.submit(session.ctx, intent.report); intent.receiptId = receipt.receiptId; clearReport(intent); dropPreview(value.previewId);
        receipts.set(receipt.receiptId, { owner: session.token, issuedAt: clock().at }); counters.submissions++;
        send(req, res, 200, receipt); return;
      }
      if (req.url === '/local/outcome') { closed(value, ['intent']); ownedIntent(session, value.intent); send(req, res, 200, store.outcome(session.ctx, value.intent)); return; }
      if (req.url === '/local/withdraw') {
        closed(value, ['receiptId']); if (!opaque(value.receiptId) || receipts.get(value.receiptId)?.owner !== session.token) throw fail('own_receipt_required', 404);
        current(req, res, session);
        send(req, res, 200, store.withdraw(session.ctx, value.receiptId)); return;
      }
      throw fail('local_route_not_found', 404);
    } catch (error) {
      const code = /^[a-z][a-z0-9_]{0,70}$/.test(error.code || '') ? error.code : 'local_operation_refused';
      const statusCode = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
      if (!res.headersSent) send(req, res, statusCode, { localOnly: true, error: { code } }); else res.end();
    }
  };
  const server = http.createServer(handler); server.requestTimeout = 5000; server.headersTimeout = 5000; server.maxRequestsPerSocket = 100;
  server.on('listening', () => { const address = server.address(); if (!address || typeof address === 'string' || address.address !== '127.0.0.1') throw Error('IPv4 loopback listener required'); port = address.port; });
  function close() {
    closing = true; for (const key of scans.keys()) dropScan(key); for (const key of previews.keys()) dropPreview(key);
    for (const intent of intents.values()) clearReport(intent); sessions.clear(); intents.clear(); receipts.clear(); registered = null;
    if (store) { store.close(); store = null; }
    if (!server.listening) return Promise.resolve();
    return new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); });
  }
  return { server, handler, origin, close, status };
}
if (require.main === module) {
  const args = process.argv.slice(2); let port = 0;
  if (args.length) { if (args.length !== 2 || args[0] !== '--port' || !/^\d{4,5}$/.test(args[1]) || +args[1] < 1024 || +args[1] > 65535) throw Error('Use --port 1024..65535'); port = +args[1]; }
  const app = createAttendedServer(); app.server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ kind: 'attended-local-census', origin: app.origin(), pid: process.pid, inMemory: true, syntheticOnly: false, realAccountAssociation: false, productionConnection: false })));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.close().then(() => console.log('ATTENDED_LOCAL_CENSUS_STOPPED')));
}
module.exports = { createAttendedServer, createServer: createAttendedServer, HEADERS, FILES };

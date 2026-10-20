'use strict';
const crypto = require('node:crypto');
const PINS = Object.freeze({html:'9c53f4c9190b6c923999105e2e5a7fcad33847e2f8c07046422cecb50e15463a',pilot:'096065bd3e7bf5745adbe83a542250d6caea2692b0034926505787fb31293f24'});
function pinned(source, kind) {
  if (crypto.createHash('sha256').update(source).digest('hex') !== PINS[kind]) throw Error('Original pilot bytes changed; refuse local overlay');
}
function once(source, before, after) {
  if (source.split(before).length !== 2) throw Error('Original pilot seam changed; refuse local overlay');
  return source.replace(before, after);
}
function renderHTML(source) {
  pinned(source, 'html');
  source = once(source, '<script src="./pilot.js" defer></script>', '<script src="./bridge.js" defer></script><script src="./pilot.js" defer></script><link rel="stylesheet" href="./local.css">');
  source = once(source, '<span class="badge">Local preview only</span>', '<span class="badge">Real addon · local only</span>');
  source = once(source, 'Everything stays in this browser’s memory: no uploads, saved reports or account linking.', 'QR images stay in this browser. Only reviewed aggregate frames can be deliberately handed to the loopback census process. Nothing reaches production or disk.');
  source = once(source, '<p class="review-footer">There is no upload or publish action in this pilot.</p>', '<p class="review-footer">Review first. The separate local census handoff accepts complete original frames only; it does not consent or submit for you.</p>');
  const panel = `<section class="panel local-census" aria-labelledby="local-heading">
    <p class="eyebrow">Step 4 · This computer only</p><h2 id="local-heading">Local shared census</h2>
    <p class="help">Real addon observations · unverified source. Your temporary Reporter A identity is fictional and proves no game or site account. All reports remain in this process memory; stopping the server discards them.</p>
    <p id="local-status" role="status" aria-live="polite">Decode a complete observation first. No local report has been submitted.</p>
    <button id="local-use" type="button" disabled>Use decoded observation locally</button>
    <p class="help">Handoff must finish within the original 30-second scan. It retains the addon’s original times and privacy masking.</p>
    <div id="local-draft" hidden><p id="local-source" class="help"></p><label class="local-consent"><input type="checkbox" id="local-consent"> I agree to associate this local observation with the fictional Reporter A for ownership and withdrawal. This is not a real account link or proof of game identity.</label>
    <div class="actions"><button id="local-intent" type="button" disabled>Prepare original local intent</button><button id="local-submit" type="button" disabled>Submit to local memory</button></div></div>
    <button id="local-recover" type="button" hidden>Check original outcome</button>
    <div id="local-results" aria-live="polite"></div>
    <button id="local-refresh" type="button">Refresh local census</button>
  </section>`;
  source = once(source, '    <details class="boundaries">', panel + '\n    <details class="boundaries">');
  return source;
}
function renderPilot(source) {
  pinned(source, 'pilot');
  // Exact, count-guarded local served-copy seams. Original source is never written.
  source = once(source, "  const protocol = window.OlympusGuildQRProtocol;", "  const protocol = window.OlympusGuildQRProtocol;\n  const bridge = window.AttendedCensusBridge;");
  source = once(source, '  function clearAll() {', '  function clearAll() {\n    bridge.clear();');
  source = once(source, "detail || 'Capture stopped. No report is retained.'", "detail || 'Capture and review stopped. Submitted local census receipts are separate.'");
  source = once(source, '    const scanning = !!session;', '    const scanning = !!session;\n    ui.start.disabled = bridge.busy();');
  source = once(source, '    session.assembler.clear(); session = null;', '    bridge.decoded(payload, Array.from(session.localFrames.values()), session.localScan);\n    session.assembler.clear(); session = null;');
  source = once(source, '    const result = await session.assembler.add(text);', '    const result = await session.assembler.add(text);\n    session.localFrames.set(protocol.parseFrame(text).part, text);');
  source = once(source, '  function start() {', '  async function start() {');
  source = once(source, '    const nonceBytes = new Uint8Array(16); crypto.getRandomValues(nonceBytes);\n    const nonce = Array.from(nonceBytes, byte => byte.toString(16).padStart(2, \'0\')).join(\'\'); nonceBytes.fill(0);', `    const token = generation;
    let localScan;
    try { ui.start.disabled = true; localScan = await bridge.start(); }
    catch (error) { fail(error); return; }
    if (token !== generation || document.hidden) { bridge.clear(); controls(); return; }
    const nonce = localScan.nonce;`);
  source = once(source, 'session = { generation, nonce, assembler:', 'session = { generation, localScan, localFrames: new Map(), nonce, assembler:');
  source = once(source, 'wallDeadline: now + protocol.LIMITS.captureMs, monotonicDeadline: performance.now() + protocol.LIMITS.captureMs', 'wallDeadline: Math.min(localScan.expiresAt, now + protocol.LIMITS.captureMs), monotonicDeadline: performance.now() + Math.max(0, Math.min(localScan.expiresAt - now, protocol.LIMITS.captureMs))');
  return source;
}
module.exports = {renderHTML, renderPilot};

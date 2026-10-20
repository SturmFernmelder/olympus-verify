/* Dormant Army QR review bytes. No runtime activation or upload switch. */
(function () {
  'use strict';
  const activation = false, uploads = false;
  return; // Unconditional source-fixed stop; retained source below is never executed.
(function () {
  'use strict';
  const protocol = window.OlympusGuildQRProtocol;
  const byId = id => document.getElementById(id);
  const ui = Object.fromEntries(['start', 'stop', 'copy', 'addon-command', 'frames', 'review-frames', 'images', 'share-window', 'use-camera', 'media-area', 'video', 'status-dot', 'status', 'progress', 'countdown', 'error', 'empty-preview', 'review', 'clear-review', 'guild-name', 'guild-scope', 'member-count', 'online-count', 'source-time', 'received-time', 'freshness', 'review-expiry'].map(id => [id, byId(id)]));
  const sourceButtons = Array.from(document.querySelectorAll('[data-source]'));
  let source = 'paste', generation = 0, session = null, review = null, worker = null, stream = null, videoTimer = null, clockTimer = null, workerPending = null, nextDecodeId = 0, imageBusy = false;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  function message(title, detail, kind) {
    ui.status.textContent = title;
    ui.progress.textContent = detail;
    ui['status-dot'].className = 'status-dot' + (kind ? ' ' + kind : '');
  }
  function controls() {
    const scanning = !!session;
    ui.stop.disabled = !scanning && !review;
    ui.copy.disabled = !scanning;
    ui.frames.disabled = !scanning || source !== 'paste';
    ui['review-frames'].disabled = !scanning || source !== 'paste';
    ui.images.disabled = !scanning || source !== 'image' || imageBusy;
    ui['share-window'].disabled = !scanning || source !== 'window' || !!stream;
    ui['use-camera'].disabled = !scanning || source !== 'camera' || !!stream;
    ui.start.textContent = scanning || review ? 'Start a new scan' : 'Start local scan';
    ui['clear-review'].hidden = !review;
  }
  function stopMedia() {
    if (videoTimer !== null) { clearInterval(videoTimer); videoTimer = null; }
    if (stream) {
      const oldStream = stream; stream = null;
      oldStream.getTracks().forEach(track => { track.onended = null; track.onmute = null; track.stop(); });
    }
    ui.video.onloadeddata = null;
    ui.video.onerror = null;
    ui.video.pause();
    ui.video.srcObject = null;
    ui['media-area'].hidden = true;
    if (worker) { worker.onmessage = null; worker.onerror = null; worker.terminate(); worker = null; }
    if (workerPending) { const pending = workerPending; workerPending = null; pending.reject(new Error('Local decoding was cancelled.')); }
    if (context && canvas.width && canvas.height) context.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 0; canvas.height = 0;
    imageBusy = false;
  }
  function clearReview() {
    review = null;
    ui.review.hidden = true; ui['empty-preview'].hidden = false;
    ['guild-name', 'guild-scope', 'member-count', 'online-count', 'source-time', 'received-time', 'freshness', 'review-expiry'].forEach(id => { ui[id].textContent = ''; });
  }
  function clearAll() {
    generation++;
    if (session) session.assembler.clear();
    session = null;
    stopMedia();
    if (clockTimer !== null) { clearInterval(clockTimer); clockTimer = null; }
    clearReview();
    ui['addon-command'].value = ''; ui.frames.value = ''; ui.images.value = '';
    ui.countdown.textContent = '';
    controls();
  }
  function stop(detail) {
    clearAll();
    ui.error.hidden = true; ui.error.textContent = '';
    message('Scan cleared', detail || 'Capture stopped. No report is retained.', '');
  }
  function fail(error) {
    const text = error instanceof Error ? error.message : String(error);
    clearAll();
    message('Scan stopped', 'No partial report is retained. Start a new scan to try again.', '');
    ui.error.textContent = text; ui.error.hidden = false;
  }
  function isCurrent(token) { return !!session && session.generation === token && generation === token && !document.hidden; }
  function checkSession(token) {
    if (!isCurrent(token)) throw new Error('This local scan has ended.');
    const now = Date.now();
    if (now < session.lastWall) throw new Error('Local clock moved backwards. Start a new scan.');
    session.lastWall = now;
    if (now >= session.wallDeadline || performance.now() >= session.monotonicDeadline) throw new Error('The fixed 30-second scan expired. Start a new scan.');
    return now;
  }
  function count(value) { return value === 'few' ? 'Fewer than 5' : value === null ? 'Unavailable' : String(value); }
  function time(value) { return new Date(value * 1000).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }); }
  function age(seconds) {
    if (seconds < 60) return 'under a minute old';
    if (seconds < 3600) { const minutes = Math.floor(seconds / 60); return minutes + (minutes === 1 ? ' minute old' : ' minutes old'); }
    const hours = Math.floor(seconds / 3600); return hours + (hours === 1 ? ' hour old' : ' hours old');
  }
  function updateReview(now) {
    if (!review) return;
    const receivedAge = Math.floor(now / 1000) - review.payload.guilds[0].receivedAt;
    const online = receivedAge > protocol.LIMITS.onlineAgeSeconds ? null : review.payload.guilds[0].online;
    ui['online-count'].textContent = count(online);
    ui.freshness.textContent = 'Guild data ' + age(receivedAge) + (receivedAge > protocol.LIMITS.onlineAgeSeconds ? '; online count withheld.' : '.');
    ui.countdown.textContent = 'Clears in ' + Math.max(0, Math.ceil((review.wallDeadline - now) / 1000)) + 's';
  }
  function startClock() {
    if (clockTimer !== null) clearInterval(clockTimer);
    clockTimer = setInterval(function () {
      try {
        if (session) {
          const now = checkSession(session.generation);
          ui.countdown.textContent = Math.max(0, Math.ceil((session.wallDeadline - now) / 1000)) + 's';
        } else if (review) {
          const now = Date.now();
          if (now < review.lastWall) throw new Error('Local clock moved backwards. The preview was cleared.');
          review.lastWall = now;
          if (now >= review.wallDeadline || performance.now() >= review.monotonicDeadline) { stop('The fixed local preview period ended. No report is retained.'); return; }
          updateReview(now);
        }
      } catch (error) { fail(error); }
    }, 250);
  }
  function showReview(payload) {
    const now = Date.now();
    const guild = payload.guilds[0];
    const remainingMs = Math.min(protocol.LIMITS.reviewMs, (payload.observedAt + protocol.LIMITS.sourceAgeSeconds) * 1000 - now, (guild.receivedAt + protocol.LIMITS.sourceAgeSeconds) * 1000 - now);
    if (remainingMs <= 0) throw new Error('The source observation expired before review.');
    session.assembler.clear(); session = null;
    stopMedia();
    ui['addon-command'].value = ''; ui.frames.value = ''; ui.images.value = '';
    review = { payload, lastWall: now, wallDeadline: now + remainingMs, monotonicDeadline: performance.now() + remainingMs };
    ui['guild-name'].textContent = guild.name;
    ui['guild-scope'].textContent = payload.realmGroup + ' · ' + payload.faction + ' · Own-guild report';
    ui['member-count'].textContent = count(guild.reportedCharacters);
    ui['source-time'].textContent = time(payload.observedAt);
    ui['received-time'].textContent = time(guild.receivedAt);
    ui['review-expiry'].textContent = new Date(review.wallDeadline).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
    ui.review.hidden = false; ui['empty-preview'].hidden = true;
    updateReview(now); controls();
    message('Complete local preview', 'All frames matched. Capture is stopped; the original source time is unchanged.', 'complete');
    startClock();
  }
  async function acceptFrame(text, token) {
    checkSession(token);
    const result = await session.assembler.add(text);
    checkSession(token);
    if (result.status === 'complete') { showReview(result.payload); return true; }
    message('Reading QR frames', result.received + ' of ' + result.total + ' unique parts received. Nothing is shown until every part matches.', 'active');
    return false;
  }
  function start() {
    clearAll();
    ui.error.hidden = true; ui.error.textContent = '';
    if (document.hidden) { fail(new Error('Keep this local page visible while scanning.')); return; }
    if (!window.isSecureContext || !window.crypto || !window.crypto.getRandomValues || !window.crypto.subtle || !protocol || !context) { fail(new Error('Use the pilot’s secure loopback server in a supported browser.')); return; }
    const nonceBytes = new Uint8Array(16); crypto.getRandomValues(nonceBytes);
    const nonce = Array.from(nonceBytes, byte => byte.toString(16).padStart(2, '0')).join(''); nonceBytes.fill(0);
    const now = Date.now();
    session = { generation, nonce, assembler: protocol.createAssembler({ nonce }), lastWall: now, wallDeadline: now + protocol.LIMITS.captureMs, monotonicDeadline: performance.now() + protocol.LIMITS.captureMs, pendingPicker: false };
    ui['addon-command'].value = '/ogstats ' + nonce;
    controls(); startClock();
    ui.countdown.textContent = '30s';
    message('Local scan started', 'Run the command in the pilot addon, then read its frames with your chosen input.', 'active');
  }
  function ensureWorker(token) {
    checkSession(token);
    if (worker) return;
    worker = new Worker('./decoder.js');
    worker.onmessage = function (event) {
      const data = event.data;
      if (!workerPending || !data || data.id !== workerPending.id || data.generation !== token) return;
      const pending = workerPending; workerPending = null;
      if (!isCurrent(token)) { pending.reject(new Error('This local scan has ended.')); return; }
      if (data.type === 'error') pending.reject(new Error(data.message || 'Local image decoding failed.'));
      else if (data.type === 'decoded' && (data.text === null || typeof data.text === 'string')) pending.resolve(data.text);
      else pending.reject(new Error('The local image decoder returned an invalid result.'));
    };
    worker.onerror = function () { if (isCurrent(token)) fail(new Error('The local image decoder stopped. Start a new scan.')); };
  }
  async function decodeDrawable(drawable, width, height, token) {
    checkSession(token);
    if (workerPending) return null;
    ensureWorker(token);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > protocol.LIMITS.imageSourceSide || height > protocol.LIMITS.imageSourceSide || width * height > protocol.LIMITS.imageSourcePixels) throw new Error('The image dimensions are invalid or exceed the bounded local source limit.');
    const scale = Math.min(1, protocol.LIMITS.decodedSide / width, protocol.LIMITS.decodedSide / height);
    canvas.width = Math.max(1, Math.floor(width * scale)); canvas.height = Math.max(1, Math.floor(height * scale));
    context.drawImage(drawable, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    context.clearRect(0, 0, canvas.width, canvas.height);
    const id = ++nextDecodeId;
    return new Promise(function (resolve, reject) {
      workerPending = { id, resolve, reject };
      try { worker.postMessage({ type: 'decode', id, generation: token, width: image.width, height: image.height, buffer: image.data.buffer }, [image.data.buffer]); }
      catch (error) { workerPending = null; image.data.fill(0); reject(error); }
    });
  }
  async function readImages() {
    if (!session || source !== 'image' || imageBusy) return;
    const token = session.generation;
    const files = Array.from(ui.images.files || []);
    ui.images.value = '';
    if (!files.length) return;
    if (files.length > protocol.LIMITS.parts) { fail(new Error('Select at most 14 QR images for this scan.')); return; }
    imageBusy = true; controls();
    try {
      for (const file of files) {
        checkSession(token);
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size < 1 || file.size > protocol.LIMITS.imageFileBytes) throw new Error('Each image must be PNG, JPEG or WebP and at most 4 MiB.');
        let bitmap = null, text;
        try {
          const header = new Uint8Array(await file.slice(0, protocol.LIMITS.imageHeaderBytes).arrayBuffer());
          let dimensions;
          try { dimensions = protocol.inspectImageHeader(header, file.type, { fileBytes: file.size }); }
          finally { header.fill(0); }
          checkSession(token);
          const scale = Math.min(1, protocol.LIMITS.decodedSide / dimensions.width, protocol.LIMITS.decodedSide / dimensions.height);
          const width = Math.max(1, Math.floor(dimensions.width * scale)), height = Math.max(1, Math.floor(dimensions.height * scale));
          bitmap = await createImageBitmap(file, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
          checkSession(token);
          if (bitmap.width !== width || bitmap.height !== height) throw new Error('The browser did not honor bounded image decoding.');
          text = await decodeDrawable(bitmap, bitmap.width, bitmap.height, token);
        } finally { if (bitmap) bitmap.close(); }
        checkSession(token);
        if (!text) throw new Error('No OLCS1 pilot frame was found in one of the selected images.');
        if (await acceptFrame(text, token)) return;
      }
    } catch (error) { if (isCurrent(token)) fail(error); }
    finally { imageBusy = false; controls(); }
  }
  function stopReturnedTracks(value) { if (value && typeof value.getTracks === 'function') value.getTracks().forEach(track => track.stop()); }
  async function capture(kind) {
    if (!session || session.pendingPicker || stream || source !== kind) return;
    const token = session.generation;
    let selected = null;
    try {
      checkSession(token);
      if (!navigator.mediaDevices) throw new Error('Media capture is unavailable. Use QR images or pasted frames.');
      session.pendingPicker = true;
      message('Choose the capture source', 'The original 30-second deadline continues while the permission picker is open.', 'active');
      ui['share-window'].disabled = true; ui['use-camera'].disabled = true;
      if (kind === 'window') {
        if (!navigator.mediaDevices.getDisplayMedia) throw new Error('Window capture is unavailable here. Use QR images or pasted frames.');
        selected = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'window' }, audio: false, monitorTypeSurfaces: 'exclude', selfBrowserSurface: 'exclude', preferCurrentTab: false, systemAudio: 'exclude' });
      } else {
        if (!navigator.mediaDevices.getUserMedia) throw new Error('Camera capture is unavailable here. Use QR images or pasted frames.');
        selected = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 } }, audio: false });
      }
      checkSession(token);
      const tracks = selected.getVideoTracks(), audio = selected.getAudioTracks();
      if (audio.length || tracks.length !== 1) throw new Error('The pilot accepts exactly one video track and no audio.');
      const track = tracks[0], settings = track.getSettings();
      if (kind === 'window' && settings.displaySurface !== 'window') throw new Error('Only a window source is allowed. Monitor, tab and unknown sources were refused.');
      const sourceFingerprint = [track.id, track.label, settings.deviceId || '', settings.displaySurface || ''].join('|');
      stream = selected; selected = null; session.pendingPicker = false;
      track.onended = function () { if (isCurrent(token)) fail(new Error('The capture source ended. The scan was cleared.')); };
      track.onmute = function () { if (isCurrent(token)) fail(new Error('The capture source was interrupted. The scan was cleared.')); };
      ui.video.onerror = function () { if (isCurrent(token)) fail(new Error('The local video preview stopped. The scan was cleared.')); };
      ui.video.srcObject = stream; ui['media-area'].hidden = false;
      await ui.video.play(); checkSession(token);
      controls();
      message('Reading QR frames', kind === 'window' ? 'Window video is local only. Game origin and reported counts remain unverified.' : 'Camera video is local only. Keep the QR’s white border visible.', 'active');
      let decoding = false;
      videoTimer = setInterval(async function () {
        if (decoding || !isCurrent(token) || ui.video.readyState < 2) return;
        decoding = true;
        try {
          checkSession(token);
          const currentSettings = track.getSettings();
          if ([track.id, track.label, currentSettings.deviceId || '', currentSettings.displaySurface || ''].join('|') !== sourceFingerprint) throw new Error('The capture source changed. Start a new scan.');
          const text = await decodeDrawable(ui.video, ui.video.videoWidth, ui.video.videoHeight, token);
          if (text && isCurrent(token)) await acceptFrame(text, token);
        } catch (error) { if (isCurrent(token)) fail(error); }
        finally { decoding = false; }
      }, 220);
    } catch (error) {
      stopReturnedTracks(selected);
      if (isCurrent(token)) fail(error);
    } finally { if (isCurrent(token)) { session.pendingPicker = false; controls(); } }
  }
  sourceButtons.forEach(button => button.addEventListener('click', function () {
    if (source === button.dataset.source) return;
    stop('Input changed. Start a new scan for the selected source.');
    source = button.dataset.source;
    sourceButtons.forEach(other => { const selected = other === button; other.classList.toggle('selected', selected); other.setAttribute('aria-pressed', String(selected)); });
    ['paste', 'image', 'window', 'camera'].forEach(name => { byId('input-' + name).hidden = name !== source; });
    controls();
  }));
  ui.start.addEventListener('click', start);
  ui.stop.addEventListener('click', function () { stop(); });
  ui['clear-review'].addEventListener('click', function () { stop('Preview cleared. No report is retained.'); });
  ui.copy.addEventListener('click', async function () {
    if (!session) return;
    const token = session.generation;
    try { checkSession(token); await navigator.clipboard.writeText(ui['addon-command'].value); checkSession(token); message('Command copied', 'Run it in the pilot addon. The same fixed 30-second scan is still active.', 'active'); }
    catch (_) { if (isCurrent(token)) { ui['addon-command'].focus(); ui['addon-command'].select(); message('Select and copy the command', 'Clipboard access was unavailable. You can copy the selected text manually.', 'active'); } }
  });
  ui['review-frames'].addEventListener('click', async function () {
    if (!session || source !== 'paste') return;
    const token = session.generation;
    const text = ui.frames.value;
    ui.frames.value = '';
    try {
      checkSession(token);
      if (!text || text.length > 2800) throw new Error('Paste a bounded set of complete pilot frames.');
      const lines = text.split(/\r?\n/).filter(line => line.length !== 0);
      if (!lines.length || lines.length > protocol.LIMITS.parts) throw new Error('Paste at most 14 complete frame lines.');
      for (const line of lines) if (await acceptFrame(line, token)) break;
    } catch (error) { if (isCurrent(token)) fail(error); }
  });
  ui.images.addEventListener('change', readImages);
  ui['share-window'].addEventListener('click', function () { capture('window'); });
  ui['use-camera'].addEventListener('click', function () { capture('camera'); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && (session || review)) stop('The page was hidden. Capture and preview were cleared.'); });
  window.addEventListener('pagehide', function () { clearAll(); });
  controls();
}());

}());

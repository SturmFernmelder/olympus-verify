(function () {
  'use strict';
  const protocol = window.OlympusGuildQRProtocol, cards = window.OlympusArmyCards;
  const PUBLISH_REALM = 'World of Warcraft: Forever PvE';
  const allowedGuild = name => name === 'Olympus' || /^Olympus (?:I|II|III|IV|V|VI|VII|VIII|IX|X)$/.test(name);
  const ui = Object.fromEntries(['report-status', 'report-preview', 'report-clear', 'report-preview-results', 'report-consent-area', 'report-consent', 'report-publish', 'report-outcome'].map(id => [id, document.getElementById(id)]));
  let admitted = false, pending = 'access', unknown = false, generation = 0, snapshot = null, deadline = null, preview = null, original = null, request = null, lastWall = Date.now();
  const say = text => { ui['report-status'].textContent = text; };
  function controls() {
    const blocked = !!pending || unknown || document.hidden || !admitted;
    ui['report-preview'].disabled = blocked || !snapshot || !!preview;
    ui['report-publish'].disabled = blocked || !preview || !ui['report-consent'].checked;
    ui['report-consent'].disabled = blocked || !preview;
    ui['report-consent-area'].hidden = !preview;
    ui['report-outcome'].hidden = !unknown; ui['report-outcome'].disabled = !!pending || document.hidden;
    window.OlympusArmyCapture?.refreshControls();
  }
  function localTime() {
    const now = Date.now();
    if (now < lastWall || !Number.isFinite(now)) throw Error('The local clock moved backwards. Review was refused.');
    lastWall = now;
    if (!deadline || now >= deadline.wallDeadline || performance.now() >= deadline.monotonicDeadline) throw Error('The original local review expired. Start a new scan.');
    return Math.floor(now / 1000);
  }
  function clear() {
    // A pending or unknown publish keeps only its immutable aggregate/token for an outcome read.
    if (pending === 'publish' || unknown || pending === 'outcome') {
      snapshot = null; preview = null; deadline = null; ui['report-consent'].checked = false; ui['report-preview-results'].replaceChildren();
      say('Capture and browser review were cleared. The original publication outcome is unresolved; check that exact outcome. Clearing does not remove a published snapshot.');
      controls(); return;
    }
    generation++; if (request) request.abort(); request = null; if (pending !== 'access') pending = '';
    snapshot = null; preview = null; deadline = null; ui['report-consent'].checked = false; ui['report-preview-results'].replaceChildren(); controls();
  }
  async function json(path, body, owned) {
    const timer = setTimeout(() => owned.abort(), 15000);
    try {
      const response = await fetch(path, {method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store', headers: {'X-Olympus': '2', ...(body === undefined ? {} : {'Content-Type': 'application/json'})}, ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: owned.signal});
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) admitted = false;
        throw Error(response.status === 401 ? 'Sign in with your current Discord account before reporting.' : response.status === 403 ? 'This account is not currently eligible to publish Army observations.' : response.status === 409 ? 'This observation conflicts with a current report or its original review is no longer eligible.' : 'The original Army operation could not be completed (HTTP ' + response.status + ').');
      }
      if (!response.body) throw Error('The original answer is unreadable.');
      const reader = response.body.getReader(), chunks = []; let bytes = 0;
      try { for (;;) { const item = await reader.read(); if (item.done) break; bytes += item.value.byteLength; if (bytes > 65536) throw Error('The original answer exceeds its bounds.'); chunks.push(item.value); } } catch (error) { await reader.cancel().catch(() => {}); throw error; } finally { reader.releaseLock(); }
      const joined = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
      return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(joined));
    } finally { clearTimeout(timer); }
  }
  function canonical(value, now) { if (!protocol || !Number.isSafeInteger(now) || now < 0) throw Error('The Army response contract is unavailable.'); return protocol.validatePayload(new TextEncoder().encode(JSON.stringify(value)), {nowSeconds: now}); }
  function renderPreview(value, now) {
    ui['report-preview-results'].replaceChildren();
    if (!cards || typeof cards.card !== 'function') throw Error('The aggregate review renderer is unavailable.');
    ui['report-preview-results'].append(cards.card(value, now));
  }
  window.OlympusArmyReport = Object.freeze({
    busy: () => !admitted || !!pending || unknown,
    clear,
    onComplete(value, originalDeadline) {
      if (!admitted || pending || unknown || document.hidden) throw Error('Current reporter eligibility is required before a new observation.');
      if (!originalDeadline || !Number.isFinite(originalDeadline.wallDeadline) || !Number.isFinite(originalDeadline.monotonicDeadline) || originalDeadline.wallDeadline > Date.now() + 900000 || originalDeadline.monotonicDeadline > performance.now() + 900000) throw Error('The original local review deadline was refused.');
      const accepted = canonical(value, Math.floor(Date.now() / 1000));
      if (accepted.faction !== 'Alliance' || !allowedGuild(accepted.guilds[0].name)) throw Error('Only an Olympus guild Alliance observation can be prepared for this Army page. Nothing was sent.');
      snapshot = JSON.parse(JSON.stringify(accepted)); snapshot.realmGroup = PUBLISH_REALM;
      canonical(snapshot, Math.floor(Date.now() / 1000));
      deadline = {...originalDeadline}; preview = null; original = null; ui['report-consent'].checked = false;
      say('Complete observation reviewed locally. Its raw game realm label stays on this device. The private preview uses the fixed World of Warcraft: Forever PvE · Alliance publication scope, which you must attest before publishing.'); controls();
    },
  });
  ui['report-preview'].addEventListener('click', async () => {
    if (!admitted || pending || unknown || !snapshot || preview || document.hidden) return;
    let now; try { now = localTime(); canonical(snapshot, now); } catch (error) { clear(); say(error.message); return; }
    const token = generation, owned = new AbortController(), exact = JSON.parse(JSON.stringify(snapshot)); pending = 'preview'; request = owned; controls();
    try {
      const data = await json('/api/army/preview', {snapshot: exact}, owned);
      if (token !== generation || document.hidden) return;
      if (!data || Object.keys(data).sort().join('|') !== 'expiresAt|format|now|persisted|previewToken|snapshot' || data.format !== 'olympus-army-preview-v1' || data.persisted !== false || typeof data.previewToken !== 'string' || !data.previewToken.length || data.previewToken.length > 8192 || !Number.isSafeInteger(data.expiresAt) || !Number.isSafeInteger(data.now) || data.expiresAt <= data.now || data.expiresAt > data.now + 900) throw Error('The private preview answer was not recognized. No publication was made.');
      localTime(); const checked = canonical(data.snapshot, data.now);
      if (JSON.stringify(checked) !== JSON.stringify(exact)) throw Error('The private preview did not match the original aggregate. Nothing was published.');
      preview = {snapshot: JSON.parse(JSON.stringify(checked)), previewToken: data.previewToken, expiresAt: data.expiresAt};
      renderPreview(preview.snapshot, data.now); ui['report-consent'].checked = false;
      say('Private preview prepared. Review its exact figures below and explicitly consent before sharing them with signed-in Olympus readers. Nothing has been published.');
    } catch (error) { if (token === generation && !document.hidden) { preview = null; ui['report-preview-results'].replaceChildren(); say(error.message || 'The private preview could not be prepared.'); } }
    finally { if (request === owned) request = null; if (token === generation) { pending = ''; controls(); } }
  });
  ui['report-consent'].addEventListener('change', controls);
  ui['report-publish'].addEventListener('click', async () => {
    if (!admitted || pending || unknown || !preview || !ui['report-consent'].checked || document.hidden) return;
    try { const now = localTime(); if (now >= preview.expiresAt) throw Error('The original private preview expired. No publication was attempted.'); canonical(preview.snapshot, now); }
    catch (error) { clear(); say(error.message); return; }
    original = {snapshot: JSON.parse(JSON.stringify(preview.snapshot)), previewToken: preview.previewToken};
    const exact = original, owned = new AbortController(); request = owned; pending = 'publish'; unknown = true; controls();
    say('Publishing this exact reviewed aggregate. Wait for its original answer before leaving this page.');
    try {
      const data = await json('/api/army/publish', {...exact, confirm: 'PUBLISH'}, owned);
      if (!data || data.state !== 'published' || JSON.stringify(data.snapshot) !== JSON.stringify(exact.snapshot)) throw Error('The original publication answer did not match the reviewed snapshot.');
      unknown = false; original = null; preview = null; snapshot = null; deadline = null; ui['report-consent'].checked = false; ui['report-preview-results'].replaceChildren(); window.OlympusArmyCapture?.clear();
      say('Snapshot shared with signed-in Olympus readers. Only the reviewed aggregate was sent. Clearing this browser does not remove that shared report or earlier reader copies.');
    } catch (error) { say((error.message || 'The original publication answer was lost.') + ' The outcome is unresolved. Check the original outcome; no retry or replacement publication was made.'); }
    finally { if (request === owned) request = null; pending = ''; controls(); }
  });
  ui['report-outcome'].addEventListener('click', async () => {
    if (pending || !unknown || !original || document.hidden) return;
    const exact = original, owned = new AbortController(); request = owned; pending = 'outcome'; controls();
    try {
      const data = await json('/api/army/outcome', exact, owned);
      if (!data || !['published', 'superseded', 'not_current'].includes(data.state)) throw Error('The original outcome is still unavailable.');
      unknown = false; original = null; preview = null; snapshot = null; deadline = null; ui['report-consent'].checked = false; ui['report-preview-results'].replaceChildren(); window.OlympusArmyCapture?.clear();
      say(data.state === 'published' ? 'This exact snapshot is currently published. This status does not identify which reporter wrote it. No retry was sent.' : data.state === 'superseded' ? 'A newer source observation is currently published. This does not prove whether this request wrote an earlier report. No replacement publication was sent.' : 'This exact snapshot is not currently published. No retry or replacement publication was sent.');
    } catch (error) { say((error.message || 'The original outcome is still unavailable.') + ' Keep the original session open. No retry was made.'); }
    finally { if (request === owned) request = null; pending = ''; controls(); }
  });
  ui['report-clear'].addEventListener('click', () => { clear(); window.OlympusArmyCapture?.clear(); if (!unknown && pending !== 'publish' && pending !== 'outcome') say('Capture and browser review cleared. No published snapshot was removed.'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clear(); if (!unknown && pending !== 'publish') say('The unpublished browser review was cleared when this page was hidden. Published reports remain separate.'); } else controls(); });
  window.addEventListener('pagehide', clear);
  setInterval(() => {
    if (!snapshot && !preview || pending || unknown) return;
    try { const now = localTime(); if (preview && now >= preview.expiresAt) throw Error('The original private preview expired. No publication was made.'); }
    catch (error) { clear(); window.OlympusArmyCapture?.clear(); say(error.message); }
  }, 250);
  (async () => {
    const owned = new AbortController(); request = owned;
    try {
      const data = await json('/api/army/reporter', undefined, owned);
      if (!data || Object.keys(data).sort().join('|') !== 'canPublish|format|now' || data.format !== 'olympus-army-reporter-v1' || data.canPublish !== true || !Number.isSafeInteger(data.now) || data.now < 0) throw Error('This account is not currently eligible to publish Army observations.');
      admitted = true; say('Current reporter access confirmed. Start a deliberate local scan. No observation has been sent.');
    } catch (error) { admitted = false; say(error.message || 'Reporter access could not be confirmed. Capture is unavailable.'); }
    finally {
      if (request === owned) request = null; pending = ''; controls();
      document.getElementById('status').textContent = admitted ? 'Ready when you are' : 'Reporter access required';
      document.getElementById('progress').textContent = admitted ? 'Choose an input, then start the original 30-second scan.' : 'Capture is unavailable until current reporter access is confirmed.';
    }
  })();
  controls();
}());

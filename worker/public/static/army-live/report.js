(function () {
  'use strict';
  let active = null, held = null;
  function mount(root, options = {}) {
    if (!root || typeof root.querySelector !== 'function') throw Error('A scoped reporter root is required.');
    const owner = options.owner || root, ownerCurrent = typeof options.isOwnerCurrent === 'function' ? options.isOwnerCurrent : () => true;
    if (active || held && (held.owner !== owner || !held.isOwnerCurrent() || held.pending)) throw Error('The original publication is still held for its original reporter. Return to that view; no replacement was made.');
    let disposed = false, localImport = null;
    const live = () => !disposed && ownerCurrent() && (!options.isCurrent || options.isCurrent());
    const removers = [], listen = (target, event, fn) => { target.addEventListener(event, fn); removers.push(() => target.removeEventListener(event, fn)); };
    const protocol = window.OlympusGuildQRProtocol, cards = window.OlympusArmyCards;
    const capture = typeof options.capture === 'function' ? options.capture : () => null;
    const PUBLISH_REALM = 'World of Warcraft: Forever PvE';
    const GUILD_NAMES = Object.freeze(['Olympus', 'Olympus I', 'Olympus II', 'Olympus III', 'Olympus IV', 'Olympus V', 'Olympus VI', 'Olympus VII', 'Olympus VIII', 'Olympus IX', 'Olympus X']);
    function canonicalGuild(name) {
      // Fold ASCII letters only; whitespace, Unicode lookalikes and unknown guilds stay outside the fixed scope.
      const asciiName = name.replace(/[a-z]/g, letter => letter.toUpperCase());
      return GUILD_NAMES.find(guild => guild.toUpperCase() === asciiName);
    }
    const ui = Object.fromEntries(['report-status', 'report-preview', 'report-clear', 'report-preview-results', 'report-consent-area', 'report-consent', 'report-publish', 'report-outcome'].map(id => [id, root.querySelector('#' + id)]));
    if (Object.values(ui).some(value => !value)) throw Error('The authored reporter fragment is incomplete.');
    if (!live()) throw Error('The original reporter context is no longer current.');
    let admitted = false, pending = 'access', unknown = !!held, generation = 0, snapshot = null, deadline = null, preview = null, original = held ? held.exact : null, request = null, lastWall = Date.now();
    const freeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
    const releaseHeld = exact => { if (held && held.exact === exact) held = null; };
    const importClear = () => { if (localImport) localImport.clear(); };
    const canLeave = () => !unknown && !['publish','outcome'].includes(pending) && !held;
    const say = text => { if (live()) ui['report-status'].textContent = text; };
    function importControls(blocked) {
      const file = root.querySelector('#aggregate-file'), zone = root.querySelector('#aggregate-drop');
      if (file) file.disabled = blocked;
      // Keep drop events reachable so the importer can suppress browser file navigation even while blocked.
      if (zone) { zone.inert = false; zone.setAttribute('role', 'group'); zone.setAttribute('aria-disabled', String(blocked)); }
    }
    function controls() {
      if (!live()) return;
      const blocked = !live() || !!pending || unknown || document.hidden || !admitted;
      ui['report-preview'].disabled = blocked || !snapshot || !!preview;
      ui['report-publish'].disabled = blocked || !preview || !ui['report-consent'].checked;
      ui['report-consent'].disabled = blocked || !preview;
      ui['report-consent-area'].hidden = !preview;
      ui['report-outcome'].hidden = !unknown; ui['report-outcome'].disabled = !!pending || document.hidden;
      importControls(blocked);
      capture()?.refreshControls();
    }
    function localTime() {
      const now = Date.now();
      if (now < lastWall || !Number.isFinite(now)) throw Error('The local clock moved backwards. Review was refused.');
      lastWall = now;
      if (!deadline || now >= deadline.wallDeadline || performance.now() >= deadline.monotonicDeadline) throw Error('The original local review expired. Start a new scan.');
      return Math.floor(now / 1000);
    }
    function clear() {
      if (disposed) return;
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
    function canonical(value, now) { if (!protocol || !Number.isSafeInteger(now) || now < 0) throw Error('The Army response contract is unavailable.'); return value?.addonVersion === '1.3.2-site.1' ? window.OlympusSanitizedExport.validateSnapshot(value, now) : protocol.validatePayload(new TextEncoder().encode(JSON.stringify(value)), {nowSeconds: now}); }
    function originalOnlineAge(value, now) {
      const guild = value?.guilds?.[0];
      if (value?.addonVersion === '1.3.2-site.1' && guild && guild.online !== null && now - guild.receivedAt > 900) {
        throw Error('The online count aged past 15 minutes. This review was cleared; select the dedicated export again to withhold that count before preparing a new preview. Nothing was published.');
      }
    }
    function renderPreview(value, now) {
      if (!live()) return;
      ui['report-preview-results'].replaceChildren();
      if (!cards || typeof cards.card !== 'function') throw Error('The aggregate review renderer is unavailable.');
      ui['report-preview-results'].append(cards.card(value, now));
    }
    const controller = Object.freeze({
      busy: () => !live() || !admitted || !!pending || unknown,
      clear, canLeave, destroy,
      attachImport(value) {
        if (!value || typeof value.clear !== 'function' || typeof value.destroy !== 'function') throw Error('The local importer is unavailable.');
        if (!live()) { value.destroy(); return; }
        localImport = value; controls();
      },
      onComplete(value, originalDeadline) {
        if (!live() || !admitted || pending || unknown || document.hidden) throw Error('Current reporter eligibility is required before a new observation.');
        if (!originalDeadline || !Number.isFinite(originalDeadline.wallDeadline) || !Number.isFinite(originalDeadline.monotonicDeadline) || originalDeadline.wallDeadline > Date.now() + 900000 || originalDeadline.monotonicDeadline > performance.now() + 900000) throw Error('The original local review deadline was refused.');
        const accepted = canonical(value, Math.floor(Date.now() / 1000));
        const guildName = canonicalGuild(accepted.guilds[0].name);
        if (accepted.faction !== 'Alliance' || !guildName) throw Error('Only an Olympus guild Alliance observation can be prepared for this Army page. Nothing was sent.');
        snapshot = JSON.parse(JSON.stringify(accepted)); snapshot.realmGroup = PUBLISH_REALM; snapshot.guilds[0].name = guildName;
        canonical(snapshot, Math.floor(Date.now() / 1000));
        deadline = {...originalDeadline}; preview = null; original = null; ui['report-consent'].checked = false;
        say('Complete observation reviewed locally. Its raw game realm label stays on this device. The private preview uses the fixed World of Warcraft: Forever PvE · Alliance publication scope, which you must attest before publishing.'); controls();
      },
    });
    listen(ui['report-preview'], 'click', async () => {
      if (!live() || !admitted || pending || unknown || !snapshot || preview || document.hidden) return;
      let now; try { now = localTime(); originalOnlineAge(snapshot, now); canonical(snapshot, now); } catch (error) { clear(); say(error.message); return; }
      const token = generation, owned = new AbortController(), exact = JSON.parse(JSON.stringify(snapshot)); pending = 'preview'; request = owned; controls();
      try {
        const data = await json('/api/army/preview', {snapshot: exact}, owned);
        if (!live() || token !== generation || document.hidden) return;
        if (!data || Object.keys(data).sort().join('|') !== 'expiresAt|format|now|persisted|previewToken|snapshot' || data.format !== 'olympus-army-preview-v1' || data.persisted !== false || typeof data.previewToken !== 'string' || !data.previewToken.length || data.previewToken.length > 8192 || !Number.isSafeInteger(data.expiresAt) || !Number.isSafeInteger(data.now) || data.expiresAt <= data.now || data.expiresAt > data.now + 900) throw Error('The private preview answer was not recognized. No publication was made.');
        localTime(); const checked = canonical(data.snapshot, data.now);
        if (JSON.stringify(checked) !== JSON.stringify(exact)) throw Error('The private preview did not match the original aggregate. Nothing was published.');
        preview = {snapshot: JSON.parse(JSON.stringify(checked)), previewToken: data.previewToken, expiresAt: data.expiresAt};
        renderPreview(preview.snapshot, data.now); ui['report-consent'].checked = false;
        say('Private preview prepared. Review its exact figures below and explicitly consent before sharing them with signed-in Olympus readers. Nothing has been published.');
      } catch (error) { if (live() && token === generation && !document.hidden) { preview = null; ui['report-preview-results'].replaceChildren(); say(error.message || 'The private preview could not be prepared.'); } }
      finally { if (request === owned) request = null; if (token === generation) { pending = ''; controls(); } }
    });
    listen(ui['report-consent'], 'change', controls);
    listen(ui['report-publish'], 'click', async () => {
      if (!live() || !admitted || pending || unknown || !preview || !ui['report-consent'].checked || document.hidden) return;
      try { const now = localTime(); if (now >= preview.expiresAt) throw Error('The original private preview expired. No publication was attempted.'); originalOnlineAge(preview.snapshot, now); canonical(preview.snapshot, now); }
      catch (error) { clear(); say(error.message); return; }
      original = freeze({snapshot: JSON.parse(JSON.stringify(preview.snapshot)), previewToken: preview.previewToken});
      held = {owner, isOwnerCurrent: ownerCurrent, exact: original, pending: true};
      const exact = original, owned = new AbortController(); request = owned; pending = 'publish'; unknown = true; controls();
      say('Publishing this exact reviewed aggregate. Wait for its original answer before leaving this page.');
      try {
        const data = await json('/api/army/publish', {...exact, confirm: 'PUBLISH'}, owned);
        if (!data || data.state !== 'published' || JSON.stringify(data.snapshot) !== JSON.stringify(exact.snapshot)) throw Error('The original publication answer did not match the reviewed snapshot.');
        releaseHeld(exact); unknown = false; original = null; preview = null; snapshot = null; deadline = null;
        if (!live()) return;
        ui['report-consent'].checked = false; ui['report-preview-results'].replaceChildren(); capture()?.clear();
        importClear();
        say('Snapshot shared with signed-in Olympus readers. Only the reviewed aggregate was sent. Clearing this browser does not remove that shared report or earlier reader copies.');
      } catch (error) { say((error.message || 'The original publication answer was lost.') + ' The outcome is unresolved. Check the original outcome; no retry or replacement publication was made.'); }
      finally { if (held && held.exact === exact) held.pending = false; if (request === owned) request = null; pending = ''; controls(); }
    });
    listen(ui['report-outcome'], 'click', async () => {
      if (!live() || pending || !unknown || !original || document.hidden) return;
      const exact = original, owned = new AbortController(); if (!held || held.exact !== exact || held.owner !== owner || !held.isOwnerCurrent()) return; held.pending = true; request = owned; pending = 'outcome'; controls();
      try {
        const data = await json('/api/army/outcome', exact, owned);
        if (!data || !['published', 'superseded', 'not_current'].includes(data.state)) throw Error('The original outcome is still unavailable.');
        releaseHeld(exact); unknown = false; original = null; preview = null; snapshot = null; deadline = null;
        if (!live()) return;
        ui['report-consent'].checked = false; ui['report-preview-results'].replaceChildren(); capture()?.clear();
        importClear();
        say(data.state === 'published' ? 'This exact snapshot is currently published. This status does not identify which reporter wrote it. No retry was sent.' : data.state === 'superseded' ? 'A newer source observation is currently published. This does not prove whether this request wrote an earlier report. No replacement publication was sent.' : 'This exact snapshot is not currently published. No retry or replacement publication was sent.');
      } catch (error) { say((error.message || 'The original outcome is still unavailable.') + ' Keep the original session open. No retry was made.'); }
      finally { if (held && held.exact === exact) held.pending = false; if (request === owned) request = null; pending = ''; controls(); }
    });
    listen(ui['report-clear'], 'click', () => { clear(); capture()?.clear(); if (!unknown && pending !== 'publish' && pending !== 'outcome') say('Capture and browser review cleared. No published snapshot was removed.'); });
    listen(document, 'visibilitychange', () => { if (document.hidden) { clear(); if (!unknown && pending !== 'publish') say('The unpublished browser review was cleared when this page was hidden. Published reports remain separate.'); } else controls(); });
    listen(window, 'pagehide', clear);
    const interval = setInterval(() => {
      if (!live()) { destroy(); return; }
      if (!snapshot && !preview || pending || unknown) return;
      try { const now = localTime(); if (preview && now >= preview.expiresAt) throw Error('The original private preview expired. No publication was made.'); }
      catch (error) { clear(); capture()?.clear(); say(error.message); }
    }, 250);
    (async () => {
      const owned = new AbortController(); request = owned;
      try {
        const data = await json('/api/army/reporter', undefined, owned);
        if (!live()) return;
        if (!data || Object.keys(data).sort().join('|') !== 'canPublish|format|now|sanitizedExporterAvailable' || data.format !== 'olympus-army-reporter-v1' || data.canPublish !== true || typeof data.sanitizedExporterAvailable !== 'boolean' || !Number.isSafeInteger(data.now) || data.now < 0) throw Error('This account is not currently eligible to publish Army observations.');
        admitted = data.sanitizedExporterAvailable;
        say(unknown ? 'The original publication outcome is unresolved. Check only that original outcome; no replacement is available.' : admitted ? 'Current reporter access and dedicated exporter availability confirmed. Select a dedicated sanitized export. No observation has been sent.' : 'Reporter access is confirmed, but the dedicated unified exporter is unavailable until publisher adoption is verified. Import and publication remain disabled.');
      } catch (error) { admitted = false; say(error.message || 'Reporter access could not be confirmed. Capture is unavailable.'); }
      finally {
        if (request === owned) request = null; pending = ''; controls();
        const local = root.querySelector('#aggregate-status');
        if (live() && local) local.textContent = admitted ? 'Current reporter access and exporter availability confirmed. Select only the dedicated sanitized export. No file has been read or sent.' : 'The dedicated export is unavailable until reporter access and publisher adoption are both confirmed. No file can be read or sent.';
      }
    })();
    function destroy() {
      if (disposed) return;
      // Importer disposal closes its reporter too; mark this side first to make that reciprocal cleanup safe.
      disposed = true;
      generation++; if (request) request.abort(); request = null;
      snapshot = null; preview = null; deadline = null; original = null;
      if (localImport) localImport.destroy(); localImport = null;
      for (const remove of removers.splice(0)) remove(); clearInterval(interval);
      ui['report-consent'].checked = false; ui['report-preview-results'].replaceChildren();
      for (const key of ['report-preview','report-publish','report-consent','report-outcome']) ui[key].disabled = true;
      importControls(true);
      if (active === controller) active = null;
    }
    active = controller; controls(); return controller;
  }
  window.OlympusArmyReportTool = Object.freeze({mount, isNavigationHeld: () => !!held});
  const standalone = document.querySelector?.('[data-army-reporter-standalone]');
  if (standalone) window.OlympusArmyReport = mount(standalone);
}());

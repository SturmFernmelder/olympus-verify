(function () {
  'use strict';
  function mount(root, options = {}) {
    if (!root || typeof root.querySelector !== 'function' || !options.report) throw Error('A scoped importer and reporter are required.');
    const report = options.report, find = id => root.querySelector('#' + id);
    const file = find('aggregate-file'), zone = find('aggregate-drop'), status = find('aggregate-status'), review = find('aggregate-review');
    if (!file || !zone || !status || !review || !find('aggregate-clear') || !find('report-clear')) throw Error('The authored local import fragment is incomplete.');
    let generation = 0, expires = null, disposed = false;
    const live = () => !disposed && (!options.isCurrent || options.isCurrent());
    const removers = [], listen = (target, event, fn) => { target.addEventListener(event, fn); removers.push(() => target.removeEventListener(event, fn)); };
    const clear = () => { generation++; expires = null; file.value = ''; review.replaceChildren(); if (!disposed) status.textContent = 'No export selected. Files stay on this device.'; };
    async function load(files) {
      if (!live()) return;
      const token = ++generation; review.replaceChildren();
      try {
        if (document.hidden || !files || files.length !== 1 || !window.OlympusSanitizedExport || report.busy()) throw Error('Current reporter access and exactly one dedicated aggregate file are required.');
        const item = files[0];
        if (item.name !== 'OlympusSiteAggregate.lua' || item.size < 1 || item.size > window.OlympusSanitizedExport.MAX_BYTES) throw Error('Choose only OlympusSiteAggregate.lua, at most 8 KiB. Never select Olympus.lua, OlympusVerify.lua or a raw account file.');
        status.textContent = 'Reading the dedicated aggregate locally…';
        let text = await item.text();
        if (!live() || token !== generation || document.hidden) { text = ''; return; }
        const snapshot = window.OlympusSanitizedExport.parse(text); text = '';
        report.onComplete(snapshot, {wallDeadline: Date.now() + 300000, monotonicDeadline: performance.now() + 300000});
        expires = {wall: Date.now() + 300000, monotonic: performance.now() + 300000, lastWall: Date.now(), lastMonotonic: performance.now()};
        review.append(window.OlympusArmyCards.card(snapshot, Math.floor(Date.now() / 1000)));
        status.textContent = 'Sanitized aggregate reviewed locally. No file was uploaded. The private preview sends only the displayed aggregate after your next action.';
      } catch (error) { if (live() && token === generation) { report.clear(); status.textContent = error.message || 'Export refused. Nothing was sent.'; } }
      finally { if (live() && token === generation) file.value = ''; }
    }
    listen(file, 'change', () => load(file.files));
    listen(zone, 'dragover', event => { event.preventDefault(); });
    listen(zone, 'drop', event => { event.preventDefault(); load(event.dataTransfer.files); });
    listen(find('aggregate-clear'), 'click', () => { clear(); report.clear(); });
    listen(find('report-clear'), 'click', clear);
    const interval = setInterval(() => {
      if (!live()) { destroy(); return; }
      if (!expires) return;
      const wall = Date.now(), mono = performance.now();
      if (!Number.isFinite(wall) || !Number.isFinite(mono) || wall < expires.lastWall || mono < expires.lastMonotonic || wall >= expires.wall || mono >= expires.monotonic) {
        clear(); report.clear(); status.textContent = 'The local review expired or its clock changed. Select a fresh dedicated export to continue.';
      } else { expires.lastWall = wall; expires.lastMonotonic = mono; }
    }, 250);
    listen(document, 'visibilitychange', () => { if (document.hidden) clear(); });
    listen(window, 'pagehide', clear);
    function destroy() { if (disposed) return; clear(); disposed = true; for (const remove of removers.splice(0)) remove(); clearInterval(interval); file.disabled = true; }
    const controller = Object.freeze({clear, destroy}); report.attachImport(controller); return controller;
  }
  window.OlympusArmyLocalImportTool = Object.freeze({mount});
  const standalone = document.querySelector?.('[data-army-reporter-standalone]');
  if (standalone && window.OlympusArmyReport) window.OlympusArmyLocalImport = mount(standalone, {report: window.OlympusArmyReport});
}());

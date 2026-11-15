/* Private admin module. Host supplies its normal CSRF-aware api(method,path,body).
 * Reading pages is sequential; repairs are individual deliberate clicks. */
window.mountRoleAudit283 = function mountRoleAudit283(container, {api}) {
  let destroyed = false, busy = false, paused = false, cursor = null, finished = false;
  let pages = 0, processed = 0, observedOnly = 0, firstSource = null, nativeLinkedCandidates = null;
  const rows = new Map(), labels = new Map();
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const stamp = value => value ? new Date(typeof value === 'number' ? value * 1000 : value).toLocaleString() : 'Unconfirmed';
  const role = id => labels.get(id) || id || 'Held';
  const names = ids => ids.length ? ids.map(role).join(', ') : '—';
  const issue = row => row.sourceHeld ? 'Source / identity held' : row.unknown ? 'Unknown historical effect' :
    row.extraUnowned.length ? 'Manual / unowned role review' : row.missing.length || row.extraOwned.length ? 'Mismatch' : 'Matches this observation';
  const root = el('section', undefined, 'card');
  root.append(el('h2', 'Discord role audit'));
  root.append(el('p', 'Compare the current native roster with Discord role holders, including accounts without a linked character. Scan times differ across pages. This page does not change native ranks, manual roles or website appointments.'));
  const toolbar = el('div', undefined, 'actions');
  const scan = el('button', 'Scan server'), pause = el('button', 'Pause'), restart = el('button', 'Start fresh'), exportButton = el('button', 'Export observed rows');
  pause.disabled = true; exportButton.disabled = true;
  toolbar.append(scan, pause, restart, exportButton); root.append(toolbar);
  const status = el('p', 'No Discord members have been reviewed.', 'muted');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); root.append(status);
  const coverage = el('p', '', 'muted'); root.append(coverage);
  const filter = el('select'), search = el('input'), sort = el('select');
  filter.setAttribute('aria-label', 'Filter role audit status'); search.type = 'search'; search.placeholder = 'Search character, Discord name or ID'; search.setAttribute('aria-label', search.placeholder);
  [['all', 'All observed candidates'], ['mismatch', 'Missing or extra roles'], ['held', 'Source / identity held'], ['unknown', 'Unknown historical effects'], ['manual', 'Manual / unowned role review'], ['ready', 'Current repair available']].forEach(([value, text]) => { const option = el('option', text); option.value = value; filter.append(option); });
  sort.setAttribute('aria-label', 'Sort role audit');
  [['name', 'Discord name A–Z'], ['name-desc', 'Discord name Z–A'], ['native', 'Native rank'], ['issues', 'Issues first']].forEach(([value, text]) => { const option = el('option', text); option.value = value; sort.append(option); });
  const filters = el('div', undefined, 'actions'); filters.append(filter, search, sort); root.append(filters);
  const result = el('div'); root.append(result); container.replaceChildren(root);
  function summary() {
    const all = [...rows.values()];
    const count = test => all.filter(test).length;
    coverage.textContent = `${pages} pages · ${processed} Discord accounts processed · ${observedOnly} outside the managed / linked comparison (counts only) · ${all.length} unique candidates. Missing: ${count(r => r.missing.length)}; extra with grant receipts: ${count(r => r.extraOwned.length)}; extra unowned: ${count(r => r.extraUnowned.length)}; known unknown effects: ${count(r => r.unknown)}; history withheld: ${count(r => r.historyWithheld)}; source held: ${count(r => r.sourceHeld)}. Separate native-linked candidate count: ${nativeLinkedCandidates ?? 'unconfirmed'} (not an overlap or absence proof). Accounts absent from Discord were not individually checked; no removal is inferred. Traversal is not atomic and does not confirm full convergence.`;
  }
  async function repair(row, button, message) {
    if (busy || destroyed || !row.previewToken) return;
    busy = true; scan.disabled = true; restart.disabled = true; button.disabled = true;
    const token = row.previewToken; row.previewToken = null;
    message.textContent = 'Rechecking current Native authority and Discord roles…';
    try {
      const data = await api('POST', '/api/admin/role-audit', {subject: row.id, previewToken: token, confirm: true});
      if (destroyed) return;
      const result = data.result?.results?.find(item => item.subject === row.id);
      message.textContent = result ? `${result.state}: ${result.reason}. Run a fresh audit to confirm current roles.` : 'No completed result was returned. Run a fresh audit; do not repeat an uncertain request.';
    } catch (error) {
      if (!destroyed) message.textContent = `Repair held: ${error?.data?.error || error?.message || 'request outcome unconfirmed'}. Refresh the audit before another action.`;
    } finally {
      busy = false; if (!destroyed) { scan.disabled = finished; restart.disabled = false; }
    }
  }
  function render() {
    if (destroyed) return; summary(); exportButton.disabled = !rows.size;
    const term = search.value.trim().toLocaleLowerCase();
    let visible = [...rows.values()].filter(row => {
      if (term && ![row.id, row.username, row.displayName, row.nativeCharacter, ...row.characters.map(c => c.name)].filter(Boolean).join(' ').toLocaleLowerCase().includes(term)) return false;
      return filter.value === 'all' || filter.value === 'mismatch' && (row.missing.length || row.extraOwned.length || row.extraUnowned.length) ||
        filter.value === 'held' && row.sourceHeld || filter.value === 'unknown' && row.unknown || filter.value === 'manual' && row.extraUnowned.length || filter.value === 'ready' && row.repairable;
    });
    visible.sort((a, b) => sort.value === 'issues' ? Number(b.review || b.repairable) - Number(a.review || a.repairable) || a.displayName.localeCompare(b.displayName) :
      sort.value === 'native' ? (a.nativeRank || 'zzzz').localeCompare(b.nativeRank || 'zzzz') || a.displayName.localeCompare(b.displayName) :
      a.displayName.localeCompare(b.displayName) * (sort.value === 'name-desc' ? -1 : 1));
    const fragment = document.createDocumentFragment(); fragment.append(el('p', `${visible.length} matching rows`));
    for (const row of visible) {
      const card = el('article', undefined, 'card'); card.append(el('h3', `${row.displayName} (${row.username})`));
      card.append(el('p', `${issue(row)} · observed ${stamp(row.observedAt)} · Discord ID ${row.id}`));
      const list = el('dl');
      [['Native character / rank', `${row.nativeCharacter || 'Unconfirmed'} / ${row.nativeRank || row.cause}`], ['Expected managed rank', role(row.expected)],
        ['Observed managed roles', names(row.actual)], ['Missing', names(row.missing)], ['Extra with acknowledged grant receipts', names(row.extraOwned)], ['Extra unowned / manual review', names(row.extraUnowned)],
        ['Historical effects', row.historyWithheld ? 'Withheld for the current privacy hold. Counts and completeness are unavailable; no absence or clear history is inferred.' : `${row.unknown} unresolved attempted effects; ${row.expiredUnattempted} expired unattempted intents. History is preserved.`],
        ['Retained history coverage', row.historyWithheld ? 'Withheld. Completeness is unavailable.' : row.historyTruncated ? 'Truncated. The full unknown count is shown, but an attended repair is unavailable until this history is reviewed.' : 'Bounded retained history is complete for this account.'],
        ['Discord server joined', `${stamp(row.discordJoinedAt)} — Discord source; not native guild join time`],
        ['Legacy name-only roster observations', row.characters.map(c => `${c.name}: ${stamp(c.legacyNameFirstObservedAt)}`).join('; ') || 'No permitted linked records'],
        ['Native observation meaning', 'Not current character/GUID episode evidence, native guild join time or a grace clock. Current episode and actual join dates are unconfirmed.']].forEach(([label, value]) => { list.append(el('dt', label), el('dd', value)); });
      card.append(list);
      if (row.repairable) {
        const button = el('button', 'Reconcile this account'), message = el('p', 'Preview expires shortly. The current writer will recheck identity, source and role custody.');
        button.disabled = busy || !row.previewToken; button.addEventListener('click', () => repair(row, button, message)); card.append(button, message);
      }
      fragment.append(card);
    }
    result.replaceChildren(fragment);
  }
  async function scanPages() {
    if (destroyed || busy || finished) return; paused = false; busy = true; scan.disabled = true; restart.disabled = true; pause.disabled = false;
    try {
      for (let chunk = 0; chunk < 250 && !paused && !destroyed; chunk++) {
        status.textContent = `Reading page ${pages + 1}… No role changes are being sent.`;
        const data = await api('GET', '/api/admin/role-audit' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
        if (destroyed) return;
        if (!Array.isArray(data.rows) || !data.coverage || data.coverage.atomicSnapshot !== false) throw new Error('Audit coverage was not confirmed');
        if (firstSource !== null && data.source?.id !== firstSource) throw new Error('The native roster changed during this traversal. Start fresh before comparing the whole server.');
        firstSource = data.source?.id ?? null;
        for (const item of data.managedRoles || []) labels.set(item.roleId, item.name);
        nativeLinkedCandidates = data.coverage.nativeLinkedCandidateSubjects;
        for (const row of data.rows) rows.set(row.id, {...row, observedAt: data.generatedAt});
        pages++; processed += data.coverage.providerRowsProcessed || 0; observedOnly += data.coverage.observedOnly || 0;
        cursor = data.nextCursor; finished = data.coverage.complete === true && !cursor; render();
        if (finished) { status.textContent = 'Discord traversal finished. These are timestamped observations, not proof that every mismatch is resolved. Repairs require a fresh current preview.'; break; }
        if (!cursor) throw new Error('Continuation coverage was not confirmed');
      }
      if (!finished) status.textContent = paused ? 'Paused. Resume continues the same expiring traversal.' : 'Read limit reached. Resume the remaining pages while the traversal is valid.';
    } catch (error) {
      if (!destroyed) status.textContent = `Coverage stopped: ${error?.data?.coverage?.gap || error?.data?.error || error?.message || 'request outcome unavailable'}. No automatic retry occurred. Start fresh when the source is available.`;
      // An expired/failed cursor must not be automatically replayed.
      paused = true; finished = true;
    } finally {
      busy = false; if (!destroyed) { pause.disabled = true; scan.disabled = finished; restart.disabled = false; scan.textContent = pages ? 'Resume scan' : 'Scan server'; render(); }
    }
  }
  scan.addEventListener('click', scanPages); pause.addEventListener('click', () => { paused = true; pause.disabled = true; });
  restart.addEventListener('click', () => { if (busy) return; rows.clear(); labels.clear(); cursor = null; pages = processed = observedOnly = 0; firstSource = nativeLinkedCandidates = null; finished = false; paused = false; scan.disabled = false; scan.textContent = 'Scan server'; status.textContent = 'Ready for a fresh read-only scan.'; render(); });
  filter.addEventListener('change', render); sort.addEventListener('change', render); search.addEventListener('input', render);
  exportButton.addEventListener('click', () => {
    const fields = ['Discord ID', 'Username', 'Display name', 'Native character', 'Native rank', 'Expected rank', 'Observed managed roles', 'Missing', 'Extra with grant receipt', 'Extra unowned', 'Unknown effects', 'Source held', 'Observed UTC'];
    // Quoting alone does not make CSV cells literal. Preserve long snowflakes
    // as text and fence spreadsheet formula/control/Unicode-width prefixes.
    const safe = value => {
      let text = String(value ?? '');
      if (/^[\s\p{Cf}\u0000-\u001f\u007f]/u.test(text) || /^[=+\-@\uFF1D\uFF0B\uFF0D\uFF20\uFE66\uFE62\uFE63\uFE6B]/u.test(text) || /^[0-9]{16,}$/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const values = [...rows.values()].map(r => [r.id, r.username, r.displayName, r.nativeCharacter, r.nativeRank, role(r.expected), names(r.actual), names(r.missing), names(r.extraOwned), names(r.extraUnowned), r.historyWithheld ? 'Withheld' : r.unknown, r.sourceHeld, new Date(r.observedAt * 1000).toISOString()]);
    const url = URL.createObjectURL(new Blob([[fields, ...values].map(row => row.map(safe).join(',')).join('\r\n')], {type: 'text/csv;charset=utf-8'}));
    const link = el('a'); link.href = url; link.download = 'private-discord-role-observations.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  });
  return {pause() { paused = true; }, destroy() { destroyed = true; paused = true; container.replaceChildren(); }};
};

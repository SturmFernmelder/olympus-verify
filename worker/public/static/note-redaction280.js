(function () {
  'use strict';
  // Receipt-note cleanup control (owner ruling 12 Nov 2026: the free-text notes of stored treasury receipt
  // rows are blanked; the rows themselves, who gave how much and when, stay). The route is Codex's
  // worker/src/treasury-note-maintenance280.ts, POST /api/admin/treasury/ledger/note-redaction with
  // {action:'preview'}, {action:'apply',review,confirm} or {action:'status'}. It admits only the owner account
  // and answers with counts, never note text. This control reads counts only and keeps no note text. It never
  // sends apply on its own: a lost, late or unreadable reply to apply is shown as not confirmed, with the exact
  // request kept on screen and a status read as the only way on. The server's one-time marker also turns any
  // later apply into a status reply, so a resend could not blank twice, but the page does not rely on that.
  const OWNER = '472099715253796864';
  const PATH = '/api/admin/treasury/ledger/note-redaction';
  const CONFIRM = 'BLANK RECEIPT NOTES';
  const STORE = 'olympus.noteRedactionAttempt280';
  const TIMEOUT_MS = 30000;
  const UUID = /^[a-f0-9-]{36}$/;
  const PREVIEW_KEYS = 'ceiling,confirmation,coveredRows,expiresAt,notesToBlank,receiptRows,review,scope,state';
  const STATUS_KEYS = 'completion,remainingCoveredNotes,scope,state,unclassifiedReceiptRows';
  const COMPLETION_KEYS = 'blanked,ceiling,completedAt,operationId,version';
  const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (v, keys) => plain(v) && Object.keys(v).sort().join(',') === keys;
  const whole = v => Number.isSafeInteger(v) && v >= 0;
  const countOrNull = v => v === null || whole(v);
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  /** The id inside the server-signed review, used only to tell this request's completion from an earlier one. */
  function reviewId(token) {
    try { const v = JSON.parse(token.slice(0, token.lastIndexOf('.'))); return plain(v) && typeof v.id === 'string' && UUID.test(v.id) ? v.id : null; }
    catch { return null; }
  }
  /** A preview reply, exactly as the route builds it, or null. The server's scope sentence is checked, never kept. */
  function readPreview(d) {
    if (!keysAre(d, PREVIEW_KEYS) || d.state !== 'preview' || d.confirmation !== CONFIRM || typeof d.scope !== 'string') return null;
    if (![d.ceiling, d.receiptRows, d.coveredRows, d.notesToBlank, d.expiresAt].every(whole) || d.coveredRows > d.receiptRows || d.notesToBlank > d.coveredRows) return null;
    if (typeof d.review !== 'string' || d.review.length > 2048 || d.review.lastIndexOf('.') < 1 || /[\x00-\x1f\x7f]/.test(d.review)) return null;
    return {receiptRows: d.receiptRows, coveredRows: d.coveredRows, notesToBlank: d.notesToBlank, ceiling: d.ceiling, expiresAt: d.expiresAt, review: d.review, operationId: reviewId(d.review)};
  }
  /** A status reply (also the reply to an apply and to a preview after completion), or null. */
  function readStatus(d) {
    if (!keysAre(d, STATUS_KEYS) || typeof d.scope !== 'string' || !countOrNull(d.remainingCoveredNotes) || !countOrNull(d.unclassifiedReceiptRows)) return null;
    const base = {remaining: d.remainingCoveredNotes, unclassified: d.unclassifiedReceiptRows};
    if (d.state === 'not_recorded' && d.completion === null) return {...base, recorded: false};
    const c = d.completion;
    if (d.state !== 'recorded' || !keysAre(c, COMPLETION_KEYS) || c.version !== 1 || typeof c.operationId !== 'string' || !UUID.test(c.operationId) || ![c.ceiling, c.blanked, c.completedAt].every(whole)) return null;
    return {...base, recorded: true, operationId: c.operationId, ceiling: c.ceiling, blanked: c.blanked, completedAt: c.completedAt};
  }
  /** Refusals the route returns before it writes anything (treasury-note-maintenance280.ts, site-admin.ts). */
  function refusal(error) {
    const status = error && error.status, code = error && error.data && error.data.error;
    if (status === 403 && code === 'forbidden') return 'forbidden';
    if (status === 401) return 'signed-out';
    if (status === 409 && (code === 'reload' || code === 'page_outdated')) return 'reload';
    if (status === 409 && code === 'receipt_note_cleanup_held') return 'held';
    if ((status === 400 && ['confirmation_required', 'bad_body', 'bad_request'].includes(code)) || (status === 403 && code === 'origin') || status === 405) return 'incomplete';
    return null;
  }
  const REFUSALS = Object.freeze({
    forbidden: 'Only the owner’s account can run this cleanup. Nothing was changed.',
    'signed-out': 'You were signed out, so the request was refused. Nothing was changed. Sign in again to continue.',
    reload: 'The site was updated while this page was open, so the request was refused. Nothing was changed. Reload the page to continue.',
    held: 'The server held the cleanup: the stored receipts changed since the count, or a receipt is in a form it cannot classify. It reported no change. Read the stored status, or count the notes again.',
    incomplete: 'The server refused the request as incomplete. Nothing was changed. Count the notes again to start over.',
  });

  function readAttempt(storage) {
    try {
      const raw = storage && storage.getItem(STORE);
      if (raw === null || raw === undefined) return {ok: true, attempt: null};
      const v = JSON.parse(raw);
      if (!keysAre(v, 'expiresAt,operationId,owner,request,sentAt') || v.owner !== OWNER || !whole(v.sentAt) || !whole(v.expiresAt) || !(v.operationId === null || UUID.test(v.operationId))
        || !keysAre(v.request, 'body,method,path') || v.request.method !== 'POST' || v.request.path !== PATH || !keysAre(v.request.body, 'action,confirm,review')
        || v.request.body.action !== 'apply' || v.request.body.confirm !== CONFIRM || typeof v.request.body.review !== 'string') return {ok: false, attempt: null};
      return {ok: true, attempt: v};
    } catch { return {ok: false, attempt: null}; }
  }
  function writeAttempt(storage, attempt) { try { if (attempt) storage.setItem(STORE, JSON.stringify(attempt)); else storage.removeItem(STORE); return true; } catch { return false; } }

  /**
   * Mounts the control in `container` for the owner account only and returns it, or returns null for anyone
   * else. deps: {h, api, user, live, now, fmtDateTime, storage, timeoutMs}.
   */
  function mount(container, deps) {
    const {h, api, user, live, now, fmtDateTime} = deps;
    if (!user || user.isAdmin !== true || user.id !== OWNER) return null;
    const storage = (() => { try { return typeof deps.storage === 'function' ? deps.storage() : null; } catch { return null; } })(), timeoutMs = Number.isSafeInteger(deps.timeoutMs) && deps.timeoutMs > 0 ? deps.timeoutMs : TIMEOUT_MS;
    const message = h('p', {role: 'status', 'aria-live': 'polite', class: 'small'});
    const stage = h('div', {class: 'stack', 'data-note-redaction280-stage': ''});
    const root = h('section', {class: 'stack note-redaction280', 'data-note-redaction280': '', 'aria-labelledby': 'note-redaction280-title'},
      h('h2', {id: 'note-redaction280-title', text: 'Receipt note cleanup'}),
      h('p', {text: 'On 12 November you decided that the free-text notes on stored treasury receipts are to be blanked. The receipts themselves stay: who gave, how much, which items and when.'}),
      h('p', {class: 'small muted', text: 'Only your account can run this, and it runs once. Every step shows counts only; no note is ever shown here.'}),
      message, stage);
    container.appendChild(root);
    let busy = false, expiryTimer = null, attempt = null, lastPreview = null;
    const current = () => live() && root.isConnected !== false;
    const button = (text, onclick, extra = {}) => h('button', {type: 'button', class: 'btn' + (extra.danger ? ' danger' : ''), text, onclick, disabled: busy || extra.disabled || undefined, 'data-note-redaction280-action': extra.action});
    const show = (state, title, ...body) => {
      if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
      while (stage.firstChild) stage.removeChild(stage.firstChild);
      const heading = h('h3', {tabindex: '-1', text: title});
      stage.setAttribute('data-note-redaction280-state', state);
      stage.appendChild(heading);
      for (const part of body.flat()) if (part) stage.appendChild(part);
      return heading;
    };
    const focusOn = heading => { if (heading && typeof heading.focus === 'function') heading.focus(); };
    const statusButton = () => button('Read the stored status', readStatusNow, {action: 'status'});
    const previewButton = () => button('Count the notes', previewNow, {action: 'preview'});
    const countsList = (items) => h('ul', {class: 'note-redaction280-counts'}, items.map(([label, value]) => h('li', null, label + ': ', h('strong', {text: value === null ? 'not known' : String(value)}))));

    const statusItems = s => [['Notes still present on covered receipts', s.remaining], ['Receipt rows the cleanup cannot classify', s.unclassified]];

    // Every step returns its heading, so each change of step can move focus to it (round 2, 12 Nov 2026).
    function idle(note) {
      return show('idle', 'Start with a count', h('p', {text: 'The count reads how many stored receipts have a note. Nothing is changed until you confirm on the next step.'}),
        note ? h('p', {class: 'small', text: note}) : null, h('div', {class: 'btn-row'}, previewButton(), statusButton()));
    }
    function confirm(p) {
      lastPreview = p;
      const tick = h('input', {type: 'checkbox', id: 'note-redaction280-understood'});
      const apply = button('Blank ' + plural(p.notesToBlank, 'note', 'notes'), () => applyNow(p), {danger: true, disabled: true, action: 'apply'});
      tick.addEventListener('change', () => { apply.disabled = busy || !tick.checked || now() >= p.expiresAt; });
      const cancel = button('Cancel', () => { lastPreview = null; focusOn(idle('The count was set aside. Nothing was changed.')); }, {action: 'cancel'});
      if (p.notesToBlank === 0) return show('nothing', 'Nothing to blank', countsList([['Receipt rows stored', p.receiptRows], ['Receipts of the kinds this cleanup covers (mail and whisper declarations)', p.coveredRows], ['Notes to blank', 0]]),
        h('p', {text: 'None of the covered receipts has a note, so there is nothing to blank. Nothing was changed.'}), h('div', {class: 'btn-row'}, statusButton()));
      const heading = show('confirm', 'Confirm the cleanup',
        countsList([['Receipt rows stored', p.receiptRows], ['Receipts of the kinds this cleanup covers (mail and whisper declarations)', p.coveredRows], ['Notes that will be blanked', p.notesToBlank]]),
        h('p', null, h('strong', {text: 'What will be removed: '}), 'the free-text note on each of those ' + plural(p.notesToBlank, 'receipt', 'receipts') + '. Each note becomes empty.'),
        h('p', null, h('strong', {text: 'What stays: '}), 'every receipt row, with its donor, character, amount, items, times and original checksum, and every other kind of record.'),
        h('p', null, h('strong', {text: 'This cannot be undone. '}), 'The site’s database keeps no copy of the notes. Earlier backups and the officers’ Watcher files are not changed by this step. The cleanup is recorded once and cannot be run again.'),
        h('p', {class: 'small muted', text: 'If a new receipt arrives before you confirm, the server counts again and includes it; the result shows the final number. This count is valid until ' + fmtDateTime(p.expiresAt) + '.'}),
        h('label', {class: 'note-redaction280-check', for: 'note-redaction280-understood'}, tick, ' I understand that ' + plural(p.notesToBlank, 'note', 'notes') + ' will be blanked and cannot be restored from the site.'),
        h('div', {class: 'btn-row'}, apply, cancel));
      const left = (p.expiresAt - now()) * 1000;
      expiryTimer = setTimeout(() => { if (current() && lastPreview === p && !busy) focusOn(idle('That count expired before it was confirmed. Nothing was changed. Count the notes again.')); }, Math.max(0, Math.min(left, 2147483647)));
      return heading;
    }
    // `s`: a "not recorded" status read while the request could still be processed. The unconfirmed heading and
    // the exact request stay on screen, with the status counts under them (round 2, 12 Nov 2026).
    function unconfirmed(a, why, s) {
      const request = JSON.stringify({method: a.request.method, path: a.request.path, body: a.request.body}, null, 2);
      const kept = h('textarea', {id: 'note-redaction280-request', rows: '8', readonly: '', spellcheck: 'false', 'aria-describedby': 'note-redaction280-request-help'});
      kept.value = request; kept.readOnly = true;
      const until = fmtDateTime(a.expiresAt + 60);
      return show('unconfirmed', 'Outcome not confirmed',
        h('p', {text: s ? 'No cleanup is recorded yet, but this request could still be processed until about ' + until + '. The request will not be sent again.'
          : why + ' It is not known whether the notes were blanked. The request will not be sent again. Read the stored status to find out.'}),
        h('label', {class: 'lab small', for: 'note-redaction280-request', text: 'The request sent at ' + fmtDateTime(a.sentAt)}),
        kept, h('p', {id: 'note-redaction280-request-help', class: 'small muted', text: 'This is the request exactly as it was sent: the signed approval from your count, and no note text.'}),
        s ? h('div', {class: 'stack', 'data-note-redaction280-status': 'not-recorded'},
          h('p', {text: 'Stored status, just read: no cleanup recorded.'}), countsList(statusItems(s)),
          h('p', {class: 'small', text: 'Read the stored status again after ' + until + ' before counting again.'})) : null,
        h('div', {class: 'btn-row'}, statusButton()));
    }
    function result(s, origin) {
      const items = statusItems(s);
      if (!s.recorded) {
        if (attempt && now() < attempt.expiresAt + 60) return unconfirmed(attempt, '', s);
        if (attempt) { attempt = null; writeAttempt(storage, null); }
        return show('not-recorded', 'No cleanup recorded', h('p', {text: 'No cleanup has been recorded, so no note has been blanked by it.'}), countsList(items),
          h('div', {class: 'btn-row'}, previewButton(), statusButton()));
      }
      const mine = origin && origin.operationId && origin.operationId === s.operationId;
      const earlier = origin && origin.operationId && origin.operationId !== s.operationId;
      const changed = mine && origin.notesToBlank !== null && origin.notesToBlank !== s.blanked;
      if (attempt) { attempt = null; writeAttempt(storage, null); }
      return show('recorded', 'Cleanup recorded',
        h('p', {text: 'The cleanup was recorded at ' + fmtDateTime(s.completedAt) + ': ' + plural(s.blanked, 'note was', 'notes were') + ' blanked, covering receipts up to record ' + s.ceiling + '.'}),
        earlier ? h('p', {text: 'It was recorded by an earlier request, not by this one. This request changed nothing.'}) : null,
        changed ? h('p', {text: 'The count said ' + origin.notesToBlank + '; the server counted again when you confirmed and blanked ' + s.blanked + '.'}) : null,
        countsList(items),
        s.remaining || s.unclassified ? h('p', {text: 'Some notes remain or some receipts cannot be classified. The cleanup cannot run again from the site; this needs an attended review.'}) : null,
        h('div', {class: 'btn-row'}, statusButton()));
    }
    function refused(kind) {
      if (kind === 'forbidden') return show('refused', 'Not available', h('p', {text: REFUSALS.forbidden}));
      return show('refused', 'Request refused', h('p', {text: REFUSALS[kind]}), kind === 'signed-out' || kind === 'reload' ? null : h('div', {class: 'btn-row'}, previewButton(), statusButton()));
    }
    const lock = on => { busy = on; for (const b of stage.querySelectorAll('button')) b.disabled = on || (b.getAttribute('data-note-redaction280-action') === 'apply'); };

    async function readStatusNow() {
      if (busy || !current()) return;
      lock(true); message.textContent = 'Reading the stored status…';
      try {
        const s = readStatus(await api('POST', PATH, {action: 'status'}, {live: current}));
        if (!current()) return;
        if (!s) { message.textContent = ''; busy = false; focusOn(show('held', 'Status not shown', h('p', {text: 'The status reply was not in the expected form, so it is not shown. Nothing was changed by reading it.'}), h('div', {class: 'btn-row'}, statusButton()))); return; }
        message.textContent = 'Status read.'; busy = false; focusOn(result(s, attempt ? {operationId: attempt.operationId, notesToBlank: null} : null));
      } catch (error) {
        if (!current()) return;
        busy = false; const kind = refusal(error);
        if (kind === 'forbidden' || kind === 'signed-out' || kind === 'reload') { message.textContent = ''; focusOn(refused(kind)); return; }
        message.textContent = 'The stored status could not be read. Nothing was changed. Try again when you are ready.'; lock(false);
      }
    }
    async function previewNow() {
      if (busy || !current()) return;
      lock(true); message.textContent = 'Counting the notes…';
      try {
        const d = await api('POST', PATH, {action: 'preview'}, {live: current});
        if (!current()) return;
        busy = false;
        const p = readPreview(d);
        if (p) { message.textContent = 'Counted. Nothing has been changed yet.'; focusOn(confirm(p)); return; }
        const s = readStatus(d); // after completion the route answers a preview with the stored status
        if (s && s.recorded) { message.textContent = 'The cleanup has already been recorded.'; focusOn(result(s, null)); return; }
        message.textContent = ''; focusOn(show('held', 'Count not shown', h('p', {text: 'The count reply was not in the expected form, so it is not shown and nothing can be confirmed from it. Nothing was changed.'}), h('div', {class: 'btn-row'}, statusButton())));
      } catch (error) {
        if (!current()) return;
        busy = false; const kind = refusal(error);
        if (kind) { message.textContent = ''; focusOn(refused(kind)); return; }
        message.textContent = 'The notes could not be counted. Nothing was changed. Try again when you are ready.'; lock(false);
      }
    }
    async function applyNow(p) {
      if (busy || !current() || lastPreview !== p || now() >= p.expiresAt) return;
      // The exact body is fixed here, before it is sent; the page sends it once and never builds another from it.
      const body = Object.freeze({action: 'apply', review: p.review, confirm: CONFIRM});
      const sent = {owner: OWNER, sentAt: now(), expiresAt: p.expiresAt, operationId: p.operationId, request: {method: 'POST', path: PATH, body}};
      attempt = sent; lastPreview = null; writeAttempt(storage, sent);
      lock(true); message.textContent = 'Sending the cleanup request. Keep this page open.';
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      let late = false;
      const timer = setTimeout(() => { late = true; if (controller) controller.abort(); }, timeoutMs);
      let answer, failure = null;
      try { answer = await api('POST', PATH, body, {live: current, signal: controller ? controller.signal : undefined}); }
      catch (error) { failure = error; }
      finally { clearTimeout(timer); }
      if (!current()) return; // the stored attempt shows as not confirmed on the next visit
      busy = false;
      if (!failure && !late) {
        const s = readStatus(answer);
        if (s && s.recorded) { message.textContent = 'The server recorded the cleanup.'; focusOn(result(s, {operationId: sent.operationId, notesToBlank: p.notesToBlank})); return; }
        message.textContent = ''; focusOn(unconfirmed(sent, 'The server answered, but not in the expected form.')); return;
      }
      const kind = late ? null : refusal(failure);
      if (kind) { attempt = null; writeAttempt(storage, null); message.textContent = ''; focusOn(refused(kind)); return; }
      message.textContent = '';
      focusOn(unconfirmed(sent, late ? 'The server did not answer within ' + Math.round(timeoutMs / 1000) + ' seconds.' : 'The reply to the cleanup request was lost or could not be read.'));
    }

    const stored = readAttempt(storage);
    if (!stored.ok) { writeAttempt(storage, null); idle(); message.textContent = 'A note of an earlier cleanup request in this tab could not be read back. Read the stored status before counting again.'; }
    else if (stored.attempt) { attempt = stored.attempt; unconfirmed(attempt, 'An earlier cleanup request from this tab had no confirmed reply.'); }
    else idle();
    return root;
  }
  window.OlympusNoteRedaction280 = Object.freeze({OWNER, PATH, CONFIRM, STORE, mount, readPreview, readStatus, refusal});
}());

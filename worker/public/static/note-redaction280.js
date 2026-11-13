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
  // Round 3 (13 Nov 2026, Codex b908253): a hold is a 409 with exactly error, message and nextAction "status"
  // (plus an optional unclassifiedReceiptRows); it refuses that request before its own write but settles no
  // earlier request. A 503 "unconfirmed" means this request's outcome is not known. Anything else is not confirmed.
  const OWNER = '472099715253796864';
  const PATH = '/api/admin/treasury/ledger/note-redaction';
  const CONFIRM = 'BLANK RECEIPT NOTES';
  const STORE = 'olympus.noteRedactionAttempt280';
  const TIMEOUT_MS = 30000;
  // A review is valid for at most 600 s after the count (the route's Review.expires); 60 s more covers a request
  // still in flight. An unreadable record of an earlier request is therefore held for 660 s from this page load.
  const GRACE = 60, UNREAD_HOLD = 660;
  const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/; // the route's OPERATION_ID
  const PREVIEW_KEYS = 'ceiling,confirmation,coveredRows,expiresAt,notesToBlank,receiptRows,review,scope,state';
  const STATUS_KEYS = 'completion,remainingCoveredNotes,scope,state,unclassifiedReceiptRows';
  const COMPLETION_KEYS = 'blanked,ceiling,completedAt,operationId,version';
  const HELD = 'receipt_note_cleanup_held', UNCONFIRMED = 'receipt_note_cleanup_unconfirmed';
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
  /** The route's hold, exactly: 409, keys error, message, nextAction "status", optional whole unclassifiedReceiptRows. */
  function readHold(error) {
    const d = error && error.status === 409 ? error.data : null;
    if (!plain(d) || d.error !== HELD || typeof d.message !== 'string' || d.nextAction !== 'status') return null;
    const keys = Object.keys(d).sort().join(',');
    if (keys === 'error,message,nextAction') return {unclassified: null};
    if (keys === 'error,message,nextAction,unclassifiedReceiptRows' && whole(d.unclassifiedReceiptRows)) return {unclassified: d.unclassifiedReceiptRows};
    return null;
  }
  /** The route's "outcome not confirmed" reply, exactly: 503, keys error, message, nextAction "status". */
  function readUnconfirmed(error) {
    const d = error && error.status === 503 ? error.data : null;
    return keysAre(d, 'error,message,nextAction') && d.error === UNCONFIRMED && typeof d.message === 'string' && d.nextAction === 'status';
  }
  /** Refusals the route returns before that request writes anything (treasury-note-maintenance280.ts, site-admin.ts). */
  function refusal(error) {
    const status = error && error.status, code = error && error.data && error.data.error;
    if (status === 403 && code === 'forbidden') return 'forbidden';
    if (status === 401) return 'signed-out';
    if (status === 409 && (code === 'reload' || code === 'page_outdated')) return 'reload';
    if (readHold(error)) return 'held';
    if ((status === 400 && ['confirmation_required', 'bad_body', 'bad_request'].includes(code)) || (status === 403 && code === 'origin') || status === 405) return 'incomplete';
    return null;
  }
  const REFUSALS = Object.freeze({
    forbidden: 'Only the owner’s account can run this cleanup. The server refused this request before it wrote anything.',
    'signed-out': 'You were signed out, so the server refused this request before it wrote anything. Sign in again to continue.',
    reload: 'The site was updated while this page was open, so the server refused this request before it wrote anything. Reload the page to continue.',
    incomplete: 'The server refused this request as incomplete, before it wrote anything.',
  });
  const HOLD_WHY = Object.freeze({
    apply: 'The server held the cleanup and refused this request before it wrote anything.',
    preview: 'The server held the cleanup, so it gave no count.',
    status: 'The server answered the status read with a hold, so no status is shown.',
  });
  const HOLD_CAUSES = Object.freeze({
    apply: 'Possible causes include an expired count, receipts that changed since the count and a receipt the server cannot classify.',
    preview: 'Possible causes include a receipt the server cannot classify and more receipts than one cleanup can check.',
    status: '',
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
    // attempt: this tab's apply whose outcome is not confirmed (readable record). unread: the time until which an
    // earlier request whose record could not be read back is still treated as pending (0 when there is none).
    let busy = false, expiryTimer = null, attempt = null, unread = 0, lastPreview = null;
    const pending = () => !!attempt || unread > 0;
    const settle = () => { attempt = null; unread = 0; writeAttempt(storage, null); };
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
    // Round 3 (second review, 13 Nov 2026): a step change that happens on its own (an expired count) moves focus only
    // when focus is inside this control or on the page itself, so an owner typing elsewhere is not interrupted.
    const focusIsOurs = () => {
      let doc = root.ownerDocument || null;
      if (!doc) { doc = root; while (doc.parentNode) doc = doc.parentNode; }
      const active = doc.activeElement;
      return !active || active === doc.body || active === doc.documentElement || root.contains(active);
    };
    const statusButton = () => button('Read the stored status', readStatusNow, {action: 'status'});
    const previewButton = () => button('Count the notes', previewNow, {action: 'preview'});
    const countsList = (items) => h('ul', {class: 'note-redaction280-counts'}, items.map(([label, value]) => h('li', null, label + ': ', h('strong', {text: value === null ? 'not known' : String(value)}))));
    const statusItems = s => [['Notes still present on covered receipts', s.remaining], ['Receipt rows the cleanup cannot classify', s.unclassified]];
    const earlierNote = () => pending() ? h('p', {'data-note-redaction280-earlier': '', text: 'A cleanup request sent earlier from this tab still has no confirmed outcome. This reply does not settle it.'}) : null;

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
      const cancel = button('Cancel', () => { lastPreview = null; focusOn(idle('The count was set aside, and nothing was sent.')); }, {action: 'cancel'});
      if (p.notesToBlank === 0) return show('nothing', 'Nothing to blank', countsList([['Receipt rows stored', p.receiptRows], ['Receipts of the kinds this cleanup covers (mail and whisper declarations)', p.coveredRows], ['Notes to blank', 0]]),
        h('p', {text: 'None of the covered receipts has a note, so there is nothing to blank.'}), h('div', {class: 'btn-row'}, statusButton()));
      const heading = show('confirm', 'Confirm the cleanup',
        countsList([['Receipt rows stored', p.receiptRows], ['Receipts of the kinds this cleanup covers (mail and whisper declarations)', p.coveredRows], ['Notes that will be blanked', p.notesToBlank]]),
        h('p', null, h('strong', {text: 'What will be removed: '}), 'the free-text note on each of those ' + plural(p.notesToBlank, 'receipt', 'receipts') + '. Each note becomes empty.'),
        h('p', null, h('strong', {text: 'What stays: '}), 'every receipt row, with its donor, character, amount, items, times and original checksum, and every other kind of record.'),
        h('p', null, h('strong', {text: 'This cannot be undone. '}), 'The site’s database keeps no copy of the notes. Earlier backups and the officers’ Watcher files are not changed by this step. The cleanup is recorded once and cannot be run again.'),
        h('p', {class: 'small muted', text: 'If a new receipt arrives before you confirm, the server counts again and includes it; the result shows the final number. This count is valid until ' + fmtDateTime(p.expiresAt) + '.'}),
        h('label', {class: 'note-redaction280-check', for: 'note-redaction280-understood'}, tick, ' I understand that ' + plural(p.notesToBlank, 'note', 'notes') + ' will be blanked and cannot be restored from the site.'),
        h('div', {class: 'btn-row'}, apply, cancel));
      const left = (p.expiresAt - now()) * 1000;
      expiryTimer = setTimeout(() => {
        if (!current() || lastPreview !== p || busy) return;
        const ours = focusIsOurs(), next = idle('That count expired before it was confirmed, so nothing was sent. Count the notes again.');
        if (ours) focusOn(next);
      }, Math.max(0, Math.min(left, 2147483647)));
      return heading;
    }
    // The pending state: this tab's request (kept on screen exactly as sent) or an earlier request whose record could
    // not be read back. `why` says what just happened; `s` is a "not recorded" status read while the request could
    // still be processed; `extra` holds counts from a hold. The status read is the only way on (round 2 and 3).
    function unconfirmed(why, s, extra) {
      const a = attempt, until = fmtDateTime(a ? a.expiresAt + GRACE : unread);
      const lead = s ? 'No cleanup is recorded yet, but ' + (a ? 'this request could still be processed until about ' + until + '. The request will not be sent again.'
          : 'the earlier request could still be processed until about ' + until + ' at the latest.')
        : why + ' It is not known whether the notes were blanked.' + (a ? ' The request will not be sent again.' : '') + ' Read the stored status to find out.';
      let kept = null;
      if (a) {
        const box = h('textarea', {id: 'note-redaction280-request', rows: '8', readonly: '', spellcheck: 'false', 'aria-describedby': 'note-redaction280-request-help'});
        box.value = JSON.stringify({method: a.request.method, path: a.request.path, body: a.request.body}, null, 2); box.readOnly = true;
        kept = [h('label', {class: 'lab small', for: 'note-redaction280-request', text: 'The request sent at ' + fmtDateTime(a.sentAt)}),
          box, h('p', {id: 'note-redaction280-request-help', class: 'small muted', text: 'This is the request exactly as it was sent: the signed approval from your count, and no note text.'})];
      }
      return show('unconfirmed', 'Outcome not confirmed', h('p', {text: lead}), kept, extra || null,
        s ? h('div', {class: 'stack', 'data-note-redaction280-status': 'not-recorded'},
          h('p', {text: 'Stored status, just read: no cleanup recorded.'}), countsList(statusItems(s)),
          // Round 3: the time is given once, in the sentence above.
          h('p', {class: 'small', text: 'Read the stored status again after that time. A new count is offered only then.'})) : null,
        h('div', {class: 'btn-row'}, statusButton()));
    }
    /** A reply that settles nothing: keeps any pending request on screen; otherwise only a status read is offered. */
    function onward(title, state, why) {
      if (pending()) return unconfirmed(why);
      return show(state, title, h('p', {text: why}), h('p', {text: 'Read the stored status before any further step.'}), h('div', {class: 'btn-row'}, statusButton()));
    }
    function held(action, hold) {
      const counts = hold.unclassified === null ? null : countsList([['Receipt rows the cleanup cannot classify', hold.unclassified]]);
      if (attempt) return unconfirmed(HOLD_WHY[action] + ' That does not settle the request below.', null, counts);
      return show('held', 'Cleanup held', h('p', {text: HOLD_WHY[action]}), counts, HOLD_CAUSES[action] ? h('p', {class: 'small', text: HOLD_CAUSES[action]}) : null, earlierNote(),
        h('p', {text: 'Read the stored status before any further step.'}), h('div', {class: 'btn-row'}, statusButton()));
    }
    function result(s, origin) {
      const items = statusItems(s);
      if (!s.recorded) {
        if (pending() && now() < (attempt ? attempt.expiresAt + GRACE : unread)) return unconfirmed('', s);
        if (pending()) settle();
        return show('not-recorded', 'No cleanup recorded', h('p', {text: 'No cleanup has been recorded, so no note has been blanked by it.'}), countsList(items),
          h('div', {class: 'btn-row'}, previewButton(), statusButton()));
      }
      const mine = origin && origin.operationId && origin.operationId === s.operationId;
      const earlier = origin && origin.operationId && origin.operationId !== s.operationId;
      const changed = mine && origin.notesToBlank !== null && origin.notesToBlank !== s.blanked;
      if (pending()) settle();
      return show('recorded', 'Cleanup recorded',
        h('p', {text: 'The cleanup was recorded at ' + fmtDateTime(s.completedAt) + ': ' + plural(s.blanked, 'note was', 'notes were') + ' blanked, covering receipts up to record ' + s.ceiling + '.'}),
        earlier ? h('p', {text: 'It was recorded by an earlier request, not by this one. This request changed nothing.'}) : null,
        changed ? h('p', {text: 'The count said ' + origin.notesToBlank + '; the server counted again when you confirmed and blanked ' + s.blanked + '.'}) : null,
        countsList(items),
        s.remaining || s.unclassified ? h('p', {text: 'Some notes remain or some receipts cannot be classified. The cleanup cannot run again from the site; this needs an attended review.'}) : null,
        h('div', {class: 'btn-row'}, statusButton()));
    }
    function refused(kind) {
      if (kind === 'forbidden') return show('refused', 'Not available', h('p', {text: REFUSALS.forbidden}), earlierNote());
      if (kind === 'incomplete' && attempt) return unconfirmed(REFUSALS.incomplete);
      return show('refused', 'Request refused', h('p', {text: REFUSALS[kind]}), earlierNote(),
        kind === 'signed-out' || kind === 'reload' ? null : h('div', {class: 'btn-row'}, pending() ? null : previewButton(), statusButton()));
    }
    const lock = on => { busy = on; for (const b of stage.querySelectorAll('button')) b.disabled = on || (b.getAttribute('data-note-redaction280-action') === 'apply'); };
    /** One request; resolves to {answer} or {failure}, never throws. */
    async function send(body, signal) {
      try { return {answer: await api('POST', PATH, body, {live: current, signal})}; } catch (error) { return {failure: error || {status: 0}}; }
    }

    async function readStatusNow() {
      if (busy || !current()) return;
      lock(true); message.textContent = 'Reading the stored status…';
      const {answer, failure} = await send({action: 'status'});
      if (!current()) return;
      busy = false; message.textContent = '';
      if (!failure) {
        const s = readStatus(answer);
        if (s) { message.textContent = 'Status read.'; focusOn(result(s, attempt ? {operationId: attempt.operationId, notesToBlank: null} : null)); return; }
        focusOn(onward('Status not shown', 'held', 'The status reply was not in the expected form, so it is not shown.')); return;
      }
      const kind = refusal(failure);
      if (kind === 'held') { focusOn(held('status', readHold(failure))); return; }
      if (kind) { focusOn(refused(kind)); return; }
      if (readUnconfirmed(failure)) { focusOn(onward('Stored state not confirmed', 'not-confirmed', 'The server could not confirm the stored state of the cleanup. If this repeats, the stored record needs an attended review.')); return; }
      focusOn(onward('Status not shown', 'held', 'The reply to the status read was lost or could not be read.'));
    }
    async function previewNow() {
      if (busy || !current() || pending()) return;
      lock(true); message.textContent = 'Counting the notes…';
      const {answer, failure} = await send({action: 'preview'});
      if (!current()) return;
      busy = false; message.textContent = '';
      if (!failure) {
        const p = readPreview(answer);
        if (p) { message.textContent = 'Counted. The cleanup has not run yet.'; focusOn(confirm(p)); return; }
        const s = readStatus(answer); // after completion the route answers a preview with the stored status
        if (s && s.recorded) { message.textContent = 'The cleanup has already been recorded.'; focusOn(result(s, null)); return; }
        focusOn(onward('Count not shown', 'held', 'The count reply was not in the expected form, so it is not shown and nothing can be confirmed from it.')); return;
      }
      const kind = refusal(failure);
      if (kind === 'held') { focusOn(held('preview', readHold(failure))); return; }
      if (kind) { focusOn(refused(kind)); return; }
      if (readUnconfirmed(failure)) { focusOn(onward('Stored state not confirmed', 'not-confirmed', 'The server could not confirm the stored state of the cleanup. If this repeats, the stored record needs an attended review.')); return; }
      focusOn(onward('Count not shown', 'held', 'The reply to the count was lost or could not be read.'));
    }
    async function applyNow(p) {
      if (busy || !current() || pending() || lastPreview !== p || now() >= p.expiresAt) return;
      // The exact body is fixed here, before it is sent; the page sends it once and never builds another from it.
      const body = Object.freeze({action: 'apply', review: p.review, confirm: CONFIRM});
      const sent = {owner: OWNER, sentAt: now(), expiresAt: p.expiresAt, operationId: p.operationId, request: {method: 'POST', path: PATH, body}};
      attempt = sent; lastPreview = null; writeAttempt(storage, sent);
      lock(true); message.textContent = 'Sending the cleanup request. Keep this page open.';
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      let late = false;
      const timer = setTimeout(() => { late = true; if (controller) controller.abort(); }, timeoutMs);
      const {answer, failure} = await send(body, controller ? controller.signal : undefined);
      clearTimeout(timer);
      if (!current()) return; // the stored attempt shows as not confirmed on the next visit
      busy = false; message.textContent = '';
      if (late) { focusOn(unconfirmed('The server did not answer within ' + Math.round(timeoutMs / 1000) + ' seconds.')); return; }
      if (!failure) {
        const s = readStatus(answer);
        if (s && s.recorded) { message.textContent = 'The server recorded the cleanup.'; focusOn(result(s, {operationId: sent.operationId, notesToBlank: p.notesToBlank})); return; }
        focusOn(unconfirmed('The server answered, but not in the expected form.')); return;
      }
      const kind = refusal(failure);
      // A refusal before this request's own write settles this request only (Codex b908253).
      if (kind) { attempt = null; writeAttempt(storage, null); focusOn(kind === 'held' ? held('apply', readHold(failure)) : refused(kind)); return; }
      if (readUnconfirmed(failure)) { focusOn(unconfirmed('The server reported that the outcome of this request is not confirmed.')); return; }
      focusOn(unconfirmed('The reply to the cleanup request was lost or could not be read.'));
    }

    const stored = readAttempt(storage);
    // The unreadable record stays in storage until a status read settles it; a later visit holds it again.
    if (!stored.ok) { unread = now() + UNREAD_HOLD; unconfirmed('A record of an earlier cleanup request from this tab could not be read back.'); }
    else if (stored.attempt) { attempt = stored.attempt; unconfirmed('An earlier cleanup request from this tab had no confirmed reply.'); }
    else idle();
    return root;
  }
  window.OlympusNoteRedaction280 = Object.freeze({OWNER, PATH, CONFIRM, STORE, mount, readPreview, readStatus, readHold, readUnconfirmed, refusal});
}());

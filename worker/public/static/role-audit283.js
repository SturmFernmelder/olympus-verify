/* Private admin module. Host supplies its normal CSRF-aware api(method,path,body).
 * Reading pages is sequential; repairs are individual deliberate clicks. */
window.mountRoleAudit283 = function mountRoleAudit283(container, {api}) {
  let destroyed = false, busy = false, paused = false, cursor = null, finished = false;
  let refusalFocus = null;
  let readPause = null, readPauseDeadline = 0, readPauseTimer = null;
  const readClock = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
  const readWait = () => Math.max(0, Math.ceil((readPauseDeadline - readClock()) / 1000));
  let pages = 0, processed = 0, observedOnly = 0, withheld = 0, unavailableReads = 0, providerRequests = 0, linkedUnavailable = 0, firstSource = null, nativeLinkedCandidates = null;
  const rows = new Map(), labels = new Map(), outcomes = new Map(), baselinePreviews = new Map(), refusalPreviews = new Map(), refusalSpent = new Set();
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls || tag === 'button') node.className = cls || 'btn';
    return node;
  };
  const stamp = value => value ? new Date(typeof value === 'number' ? value * 1000 : value).toLocaleString() : 'Unconfirmed';
  const role = id => labels.get(id) || id || 'Held';
  const names = ids => ids.length ? ids.map(role).join(', ') : '—';
  const issue = row => row.sourceHeld ? 'Source / identity held' : row.manualPutHeld ? "Discord refused an earlier grant of this role — review current permissions" : row.baselineGrantOnly ? "Starting point accepted — new grants only; existing rank removals stay manual" : row.unknown ? 'Unknown historical effect' :
    row.extraUnowned.length ? 'Manual / unowned role review' : row.missing.length || row.extraOwned.length ? 'Mismatch' : 'Matches this observation';
  const holdReason = row => ({configuration_held:'The configured membership policy is unavailable.',source_missing:"No guild roster export has been received. In game, Sync & reload in Olympus Verify, then wait for the Watcher to upload it.",source_invalid:"The latest roster export could not be checked. Make a fresh one: in game, Sync & reload in Olympus Verify, then wait for the Watcher.",source_stale:"A fresh roster export is needed. In game, Sync & reload in Olympus Verify, then wait for the Watcher.",source_incomplete:"The latest roster export is incomplete or could not be trusted. Make a fresh one: in game, Sync & reload in Olympus Verify, then wait for the Watcher.",source_scope_mismatch:"The roster export comes from a guild or realm this site does not accept. Export it again while logged in on a character in the guild.",source_size_held:"The roster export looked too small or much shorter than the previous one, so it was not used. Check the guild roster in game, then make a fresh export (Sync & reload, or /olv roster).",no_link_record:"No usable character link is recorded for this account. The member can verify a character with Get my code in the pinned guide.",unfinished_verification:"The linked character has not completed its membership proof. Ask the member to use Refresh character proof in Discord and whisper the new code from that same character; then send a fresh guild roster with Sync & reload.",link_history_limit:"This account has too many related character records for this bounded check. Use Applications & Roster > Lookup to inspect its linked characters and verification history; no role change is available here.",link_data_invalid:'A character link has incomplete or inconsistent identity fields.',guid_conflict:'The current character identity cannot be confirmed from the permitted records.',native_rank_unmapped:"The active rank policy has no Discord role for the linked character's guild rank.",identity_proof_missing:"A linked character has no accepted proof that it belongs to this member. Ask the member to press Refresh character proof in Discord and whisper the new code from that character. Do not reset the old history.",native_name_mismatch:'The linked character GUID and native name do not agree.',membership_not_confirmed:'A linked character has not reached the confirmed member state.',departure_not_confirmed:"A linked character is missing from the latest roster, but its departure from the guild has not been confirmed.",native_identity_incomplete:'The native roster has no usable GUID for a linked name.',no_qualified_link:"None of this account's character links is currently proven and in the guild.",departure:"The proven character links show no current guild member. This comparison does not authorize a removal. Inspect the guild roster and the account in Discord before a separate manual decision.",ban:'Current account standing prevents membership access.',rename_hold:"A rename Blizzard required is waiting for review. Open Applications & Roster > Renames."})[row.holdReason || row.cause] || "The roster and verification records could not confirm this account as a guild member. Look up its characters and verification history in Applications & Roster > Lookup.";
  const root = el('section', undefined, 'card role-audit283');
  root.append(el('h2', 'Discord role audit'));
  root.append(el('p', "Compare characters linked from the current guild roster with their Discord accounts. Pressing Verify, or having a matching name, does not prove who owns a character; the verification whisper, mail or roster proof still has to be accepted. The optional whole-server scan also finds role holders with no linked character. Each read shows its time. This page does not change guild ranks, manual roles or website appointments."));
  const toolbar = el('div', undefined, 'btn-row');
  const policy = el('select'); policy.setAttribute('aria-label', 'Role audit policy view');
  [['active', 'Active policy — attended repairs'], ['steward-v3', 'Inactive Steward v3 — read-only plan']].forEach(([value, text]) => { const option = el('option', text); option.value = value; policy.append(option); });
  const scope = el('select'); scope.setAttribute('aria-label', 'Role comparison scope');
  [['native', 'Current native roster links'], ['linked', 'All recorded character links'], ['server', 'Whole Discord server — includes unlinked role holders']].forEach(([value, text]) => { const option = el('option', text); option.value = value; scope.append(option); });
  const scanTitle = () => scope.value === 'server' ? 'Scan whole server' : scope.value === 'linked' ? 'Compare linked accounts' : 'Compare current roster';
  const scan = el('button', scanTitle()), pause = el('button', 'Pause'), restart = el('button', 'Start fresh'), exportButton = el('button', 'Export observed rows');
  pause.disabled = true; exportButton.disabled = true;
  toolbar.append(policy, scope, scan, pause, restart, exportButton); root.append(toolbar);
  const status = el('p', 'No Discord members have been reviewed.', 'muted');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); root.append(status);
  const coverage = el('p', '', 'muted'); root.append(coverage);
  const filter = el('select'), search = el('input'), sort = el('select');
  filter.setAttribute('aria-label', 'Filter role audit status'); search.type = 'search'; search.placeholder = 'Search character, Discord name or ID'; search.setAttribute('aria-label', search.placeholder);
  [['all', 'All observed candidates'], ['mismatch', 'Missing or extra roles'], ['held', 'Source / identity held'], ['unknown', 'Unknown historical effects'], ['manual', 'Manual / unowned role review'], ['ready', 'Current repair available']].forEach(([value, text]) => { const option = el('option', text); option.value = value; filter.append(option); });
  sort.setAttribute('aria-label', 'Sort role audit');
  [['name', 'Discord name A–Z'], ['name-desc', 'Discord name Z–A'], ['native', 'Native rank'], ['issues', 'Issues first']].forEach(([value, text]) => { const option = el('option', text); option.value = value; sort.append(option); });
  const filters = el('div', undefined, 'btn-row'); filters.append(filter, search, sort); root.append(filters);
  const result = el('div'); root.append(result); container.replaceChildren(root);
  const lockInputs = value => { policy.disabled = value || readWait() > 0; scope.disabled = value || readWait() > 0; filter.disabled = value; search.disabled = value; sort.disabled = value; };
  const clearReadPause = () => { if (readPauseTimer !== null) clearTimeout(readPauseTimer); readPauseTimer = null; readPause = null; readPauseDeadline = 0; };
  function paintReadPause() {
    if (destroyed || !readPause) return;
    const left = readWait();
    status.textContent = readPause.floorOnly ? left > 0 ? `A confirmed Discord reply requires at least ${left} more second(s) of waiting. Other read results remain unconfirmed (${readPause.gap}). Completed pages are retained; no automatic retry or role change occurs.` : `The known minimum wait has ended; other read results remain unconfirmed (${readPause.gap}). Start fresh for a new read. No automatic retry or cursor renewal occurred.` : left > 0 ? `Discord asked this read to wait ${left} more second(s). Completed pages are retained. No automatic retry or role change occurs.` : readPause.resumeAvailable ? 'Discord’s observed wait has ended. Resume scan continues the same original traversal; no automatic retry occurred.' : 'Discord’s observed wait has ended, but it outlasted the original traversal. Start fresh for a new read; the old source and cursor were not renewed.';
    lockInputs(busy); scan.textContent = 'Resume scan'; scan.disabled = busy || left > 0 || finished; restart.disabled = busy || left > 0;
    if (left > 0 && readPauseTimer === null) readPauseTimer = setTimeout(() => { readPauseTimer = null; if (!destroyed) { render(); paintReadPause(); } }, Math.min(1000, left * 1000));
  }
  function retainReadPause(error) {
    const data = error?.data, p = data?.readPacing, floorOnly = p?.kind === 'original-discord-get429-floor';
    const integer = value => Number.isSafeInteger(value) && value >= 0 && value <= 253402300799;
    if ((floorOnly ? ![403, 429, 503].includes(error?.status) || typeof data?.coverage?.gap !== 'string' : error?.status !== 429 || data?.coverage?.gap !== 'discord_rate_limited') || data.coverage.complete !== false || data.automaticRetry !== false || !p || p.version !== 1 || !['original-discord-get429', 'retained-discord-get429', 'original-discord-get429-floor'].includes(p.kind) || ![p.serverNow, p.notBefore, p.traversalExpiresAt].every(integer) || !Number.isSafeInteger(p.retryAfterSeconds) || p.retryAfterSeconds < 0 || p.retryAfterSeconds > 86401 || p.retryAfterSeconds !== Math.max(0, p.notBefore - p.serverNow) || typeof p.resumeAvailable !== 'boolean' || p.resumeAvailable !== (!floorOnly && Math.max(p.notBefore, p.serverNow) < p.traversalExpiresAt) || (p.resumeAvailable ? typeof data.resumeCursor !== 'string' || !data.resumeCursor.length || data.resumeCursor.length > 4096 : data.resumeCursor !== null)) return false;
    // This is a relative wait from an original server response, never api()'s
    // guessed fallback or its 900-second display clamp. The server independently
    // enforces its signed not-before restriction before any more Discord I/O.
    clearReadPause(); readPause = {resumeAvailable: p.resumeAvailable, floorOnly, gap: data.coverage.gap}; readPauseDeadline = readClock() + p.retryAfterSeconds * 1000;
    if (p.resumeAvailable) cursor = data.resumeCursor;
    return true;
  }
  function summary() {
    const all = [...rows.values()];
    const count = test => all.filter(test).length;
    const focused = scope.value !== 'server';
    coverage.textContent = `${policy.value === 'steward-v3' ? 'Inactive v3 planning view: activation requires a separately reviewed rollout; no repair tokens or writes. ' : ''}${pages} pages · ${processed} ${focused ? 'linked-account candidates' : 'Discord accounts'} processed · ${providerRequests} Discord read requests from completed pages (incomplete-page requests are not included) · ${observedOnly} outside the managed / linked comparison (counts only) · ${withheld} privacy-held, erased, screening-pending or bot candidates withheld in traversal (counts only; identity, history and completeness unavailable) · ${unavailableReads} chosen-account reads unavailable (no classification disclosed) · ${linkedUnavailable} linked-account reads unavailable (counts only; no cause disclosed) · ${all.length} unique visible candidates. Missing: ${count(r => r.missing.length)}; extra with grant receipts: ${count(r => r.extraOwned.length)}; extra unowned: ${count(r => r.extraUnowned.length)}; known unknown effects: ${count(r => r.unknown)}; source held: ${count(r => r.sourceHeld)}. Separate native-linked candidate count: ${nativeLinkedCandidates ?? 'unconfirmed'} (not an overlap or absence proof). ${focused ? 'This scope does not check role holders who have no linked character. An unavailable account is not proof that it is gone or a reason to remove roles.' : 'Accounts absent from Discord were not individually checked; no removal is inferred.'} Traversal is not atomic and does not confirm full convergence.`;
  }
  async function review(row, button, message) {
    if (busy || destroyed || readWait() > 0 || policy.value !== 'active' || row.activationRequired) return;
    busy = true; lockInputs(true); scan.disabled = true; restart.disabled = true; button.disabled = true;
    row.previewToken = null; row.reviewed = false;
    message.textContent = 'Reading this account again for a fresh, source-bounded preview. No role changes are being sent…';
    try {
      const data = await api('GET', '/api/admin/role-audit?subject=' + encodeURIComponent(row.id));
      if (destroyed) return;
      if (!Array.isArray(data.rows) || data.rows.length > 1 || data.nextCursor || data.coverage?.scope !== 'single_discord_member_read' || data.coverage.singleMemberReadComplete !== true || data.coverage.atomicSnapshot !== false) throw new Error('Single-account coverage was not confirmed');
      for (const item of data.managedRoles || []) labels.set(item.roleId, item.name);
      const fresh = data.rows.find(item => item.id === row.id && !item.historyWithheld && item.cause !== 'privacy_held' && !item.pending && !item.bot);
      refusalPreviews.delete(row.id); refusalSpent.delete(row.id);
      if (!fresh) { rows.delete(row.id); unavailableReads++; status.textContent = 'This account is unavailable for this comparison. No reason is disclosed; no confirmation or repair was sent.'; return; }
      const signature = item => JSON.stringify([item.expected, item.snapshotId, item.nativeCharacter, item.nativeRank, [...item.actual].sort(), [...item.missing].sort(), [...item.extraOwned].sort(), [...item.extraUnowned].sort(), !!item.baselineGrantOnly, item.baselineFindingId ?? null]);
      const changed = signature(fresh) !== signature(row);
      const ready = !changed && fresh.repairable && !fresh.sourceHeld && !fresh.activationRequired && (!fresh.extraUnowned.length || fresh.baselineGrantOnly === true) && fresh.maxPlannedEffects === 2 && !!fresh.previewToken && Number.isSafeInteger(fresh.previewExpiresAt) && Number.isSafeInteger(fresh.confirmBy) && fresh.confirmReserveSeconds >= 112 && fresh.confirmBy <= fresh.previewExpiresAt - 112 && fresh.confirmBy > Math.floor(Date.now() / 1000);
      rows.set(row.id, {...fresh, observedAt: Number.isSafeInteger(fresh.discordObservedAt) ? fresh.discordObservedAt : data.generatedAt, reviewed: ready, previewToken: ready ? fresh.previewToken : null});
      status.textContent = ready ? 'Fresh account preview loaded. Review the updated facts and consequences, then use the separate Confirm button.' : changed ? 'The account or native source changed. Updated facts are shown; review this row again before confirming. No repair was sent.' : fresh.repairable && fresh.previewToken ? 'This preview has insufficient confirmation reserve. Review again for a new read; a fresh native export or session may be needed. No repair was sent.' : 'The current account/source is held or needs no repair. No confirmation or repair was sent.';
    } catch (error) {
      if (!destroyed) status.textContent = `Fresh preview unavailable: ${error?.data?.error || error?.message || 'read unavailable'}. No repair was sent and no automatic retry occurred.`;
    } finally {
      busy = false; if (!destroyed) { lockInputs(false); scan.disabled = finished; restart.disabled = false; render(); }
    }
  }
  async function repair(row, button, message) {
    if (busy || destroyed || readWait() > 0 || !row.reviewed || !row.previewToken || row.activationRequired || (row.extraUnowned.length && row.baselineGrantOnly !== true) || row.maxPlannedEffects !== 2 || policy.value !== 'active') return;
    if (!Number.isSafeInteger(row.confirmBy) || row.confirmBy <= Math.floor(Date.now() / 1000)) { row.previewToken = null; row.reviewed = false; status.textContent = 'The original preview no longer has the full confirmation reserve. Review this account again for a new read. No role change was sent by this request.'; render(); return; }
    busy = true; lockInputs(true); scan.disabled = true; restart.disabled = true; button.disabled = true;
    const token = row.previewToken; row.previewToken = null; row.reviewed = false;
    message.textContent = 'Rechecking current Native authority and Discord roles…';
    try {
      const data = await api('POST', '/api/admin/role-audit', {subject: row.id, previewToken: token, confirm: true});
      if (destroyed) return;
      const result = data.result?.results?.find(item => item.subject === row.id);
      message.textContent = result ? data.result.requests === 0 ? `${result.state}: ${result.reason}. No role change was sent by this request. Review this account again before confirming.` : result.state === 'unknown' ? `Outcome unconfirmed: ${result.reason}. Managed roles may have changed. Run a fresh audit and inspect the retained receipts; do not repeat an uncertain request.` : `${result.state}: ${result.reason}. Run a fresh audit to confirm current roles and inspect retained receipts before another correction. No automatic retry occurred.` : 'Outcome unconfirmed: managed roles may have changed. Run a fresh audit and inspect the retained receipts; do not repeat an uncertain request.';
      outcomes.set(row.id, message.textContent);
    } catch (error) {
      if (!destroyed) { message.textContent = error?.data?.outcome === 'not_started' && error.data.roleChangeSent === false ? `Request refused before the writer: ${error.data.error}. No role change was sent by this request. Review this account again before confirming.` : `Outcome unconfirmed: managed roles may have changed (${error?.data?.error || error?.message || 'reply unavailable'}). Run a fresh audit and inspect the retained receipts; do not repeat an uncertain request.`; outcomes.set(row.id, message.textContent); }
    } finally {
      busy = false; if (!destroyed) { lockInputs(false); scan.disabled = finished; restart.disabled = false; render(); }
    }
  }
  async function reviewBaseline(row) {
    if (busy || destroyed || readWait() > 0 || policy.value !== 'active' || row.activationRequired) return;
    busy = true; lockInputs(true); scan.disabled = true; restart.disabled = true;
    baselinePreviews.delete(row.id); row.previewToken = null; row.reviewed = false;
    outcomes.set(row.id, 'Reading the original operation and today\'s verified roles. No role changes are being sent…'); render();
    try {
      const data = await api('GET', '/api/admin/role-baseline?subject=' + encodeURIComponent(row.id));
      if (destroyed) return;
      if (data.adopted === true) {
        outcomes.set(row.id, "A starting point is already recorded. Press Read current account before considering a new grant. The old result stays unknown. Ordinary rank removals for this account remain manual in Discord; separate ban and erasure rules still apply.");
      } else if (typeof data.previewToken === 'string' && Number.isSafeInteger(data.expiresAt) && data.expiresAt > Math.floor(Date.now() / 1000) && data.roleChangesSent === 0 && Array.isArray(data.observedRoles) && data.observedRoles.length <= 250 && data.observedRoles.every(value => typeof value === 'string' && /^[1-9][0-9]{16,19}$/.test(value)) && data.receipt && typeof data.receipt.id === 'string' && /^[0-9a-f]{32}$/.test(data.receipt.id) && [0, 1].includes(data.receipt.desired) && typeof data.receipt.roleId === 'string' && Number.isSafeInteger(data.receipt.createdAt) && Number.isSafeInteger(data.snapshotId) && Number.isSafeInteger(data.snapshotAt) && typeof data.expectedRole === 'string') {
        baselinePreviews.set(row.id, {token: data.previewToken, expiresAt: data.expiresAt, observedRoles: [...data.observedRoles], receipt: {...data.receipt}, expectedRole: data.expectedRole, snapshotId: data.snapshotId, snapshotAt: data.snapshotAt});
        outcomes.set(row.id, "Check today's roles and the old uncertain operation before accepting. Accepting records a new starting point; it does not confirm, resend or cancel the old request, grant a role or remove one. A new grant needs its own fresh review. Ordinary rank removals for this account remain manual in Discord; separate ban and erasure rules still apply.");
      } else {
        outcomes.set(row.id, "A starting point cannot be recorded for this account. Read Why held and the retained-history coverage on its card, then inspect its characters in Applications & Roster > Lookup. No role change was sent.");
      }
    } catch (error) {
      if (!destroyed) outcomes.set(row.id, `Starting-point review unavailable: ${error?.data?.error || error?.message || 'read unavailable'}. No role changes were sent.`);
    } finally {
      busy = false; if (!destroyed) { lockInputs(false); scan.disabled = finished; restart.disabled = false; render(); }
    }
  }
  async function adoptBaseline(row) {
    const preview = baselinePreviews.get(row.id);
    if (busy || destroyed || readWait() > 0 || policy.value !== 'active' || !preview) return;
    baselinePreviews.delete(row.id);
    if (preview.expiresAt <= Math.floor(Date.now() / 1000)) { outcomes.set(row.id, 'The starting-point review expired. Read it again; no decision or role change was sent.'); render(); return; }
    busy = true; lockInputs(true); scan.disabled = true; restart.disabled = true;
    outcomes.set(row.id, 'Rechecking the original operation, current roles and verification before recording this decision…'); render();
    try {
      const data = await api('POST', '/api/admin/role-baseline', {subject: row.id, previewToken: preview.token, confirm: true});
      if (!destroyed) outcomes.set(row.id, data.adopted === true && data.roleChangesSent === 0
        ? "New starting point recorded. No role changed. The old request stays unchanged with its result unknown. Press Read current account before reviewing any fresh grant. Ordinary rank removals for this account remain manual in Discord; separate ban and erasure rules still apply."
        : 'The decision was not confirmed. Read the current account and recorded decision before trying again. No automatic retry occurred.');
    } catch (error) {
      if (!destroyed) outcomes.set(row.id, `The decision could not be confirmed: ${error?.data?.error || error?.message || 'reply unavailable'}. Read this account again to check whether it was recorded. No automatic retry or role change was requested.`);
    } finally {
      busy = false; if (!destroyed) { lockInputs(false); scan.disabled = finished; restart.disabled = false; render(); }
    }
  }
  async function reviewRefusedGrant(row) {
    if (busy || destroyed || readWait() > 0 || policy.value !== 'active' || row.activationRequired || refusalSpent.has(row.id)) return;
    busy = true; lockInputs(true); scan.disabled = true; restart.disabled = true;
    refusalPreviews.delete(row.id); row.previewToken = null; row.reviewed = false;
    outcomes.set(row.id, 'Reading the refused grant, current roles and bot permissions. No role change is being sent.'); render();
    try {
      const data = await api('GET', '/api/admin/role-put-refusal-retry?subject=' + encodeURIComponent(row.id));
      if (destroyed) return;
      const validId = value => typeof value === 'string' && /^[1-9][0-9]{16,19}$/.test(value);
      if (data.subject !== row.id || !validId(data.expectedRole) || typeof data.previewToken !== 'string' || !data.previewToken.length || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Math.floor(Date.now() / 1000) || data.automaticRetry !== false || data.oldReceiptsPreserved !== true || data.noExistingRoleRemovals !== true || !['retry_grant_once', 'record_present_role'].includes(data.mode) || data.maxPlannedEffects !== (data.mode === 'retry_grant_once' ? 1 : 0) || !Array.isArray(data.observedRoles) || data.observedRoles.length > 250 || !data.observedRoles.every(validId) || new Set(data.observedRoles).size !== data.observedRoles.length || !Number.isSafeInteger(data.snapshotId) || !Number.isSafeInteger(data.snapshotAt) || !Array.isArray(data.refusedAttempts) || !data.refusedAttempts.length || data.refusedAttempts.length > 64 || !data.refusedAttempts.every(r => typeof r.id === 'string' && /^[0-9a-f]{32}$/.test(r.id) && [403, 404].includes(r.status) && Number.isSafeInteger(r.checkedAt))) throw Error('Unconfirmed review');
      refusalPreviews.set(row.id, {...data, observedRoles: [...data.observedRoles], refusedAttempts: data.refusedAttempts.map(r => ({...r}))});
      refusalFocus = {id:row.id, target:'confirm'};
      outcomes.set(row.id, 'Review this new one-time action. The old refused operations stay unchanged. No existing role is planned for removal. If confirmation or current permission fails, the bot may undo only the new grant it just made. This does not settle an unknown old operation or turn on automatic retries.');
    } catch {
      if (!destroyed) outcomes.set(row.id, "The refused-grant review is unavailable. No role change was sent. Press Read current account, then check the reason under Why held and the bot's role permissions in Discord's server settings.");
    } finally {
      busy = false; if (!destroyed) { lockInputs(false); scan.disabled = finished; restart.disabled = false; render(); }
    }
  }
  async function confirmRefusedGrant(row) {
    const preview = refusalPreviews.get(row.id);
    if (busy || destroyed || readWait() > 0 || policy.value !== 'active' || !preview || refusalSpent.has(row.id)) return;
    refusalPreviews.delete(row.id);
    if (preview.expiresAt <= Math.floor(Date.now() / 1000)) { outcomes.set(row.id, "The refused-grant review expired; nothing was submitted. Press Review refused grant to start again."); render(); return; }
    refusalSpent.add(row.id); busy = true; lockInputs(true); scan.disabled = true; restart.disabled = true;
    outcomes.set(row.id, 'Submitting the separate one-time action. This page will not repeat it.'); render();
    try {
      const data = await api('POST', '/api/admin/role-put-refusal-retry', {subject: row.id, previewToken: preview.previewToken, confirm: true});
      if (destroyed) return;
      const result = data.result;
      outcomes.set(row.id, data.automaticRetry === false && data.oldReceiptsPreserved === true && data.noExistingRoleRemovals === true && result && Array.isArray(result.results) && !result.results.some(r => r.state === 'unknown') && Number.isSafeInteger(data.putAttemptsStarted) && data.putAttemptsStarted >= 0 && data.putAttemptsStarted <= 1
        ? `The one-time action started ${data.putAttemptsStarted} new grant attempt(s). Press Read current account to confirm the roles and recorded outcome. Old refusals are preserved. Existing roles were not planned for removal; the bot may undo only this new grant if confirmation or current permission fails. No automatic retry was authorized.`
        : 'Outcome unconfirmed. A managed role may have changed. Read the account and inspect its retained operations before considering another action; this page will not repeat this request.');
    } catch (error) {
      if (!destroyed) outcomes.set(row.id, error?.data?.outcome === 'not_started' && error.data.roleChangeSent === false
        ? 'The one-time action was refused before the writer. No role change was sent. Read the account again before another review.'
        : 'Outcome unconfirmed. A managed role may have changed. Read the account and inspect its retained operations; this page will not repeat the request.');
    } finally {
      busy = false; if (!destroyed) { refusalFocus = {id:row.id,target:'read'}; lockInputs(false); scan.disabled = finished; restart.disabled = false; render(); }
    }
  }
  function render() {
    if (destroyed) return; summary(); exportButton.disabled = !rows.size;
    let focusTarget = null;
    const term = search.value.trim().toLocaleLowerCase();
    let visible = [...rows.values()].filter(row => {
      if (term && ![row.id, row.username, row.displayName, row.nativeCharacter, ...row.characters.map(c => c.name)].filter(Boolean).join(' ').toLocaleLowerCase().includes(term)) return false;
      return filter.value === 'all' || filter.value === 'mismatch' && (row.missing.length || row.extraOwned.length || row.extraUnowned.length) ||
        filter.value === 'held' && row.sourceHeld || filter.value === 'unknown' && row.unknown || filter.value === 'manual' && (row.extraUnowned.length || row.manualPutHeld) || filter.value === 'ready' && row.repairable;
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
        ...(row.sourceHeld ? [['Why held', holdReason(row)]] : []),
        ...(row.manualPutHeld ? [["Discord refusal", "Discord refused an earlier grant of this role. Review refused grant lets you allow one new grant, or record that the member already has the role. The old refusal stays on record."]] : []),
        ...(row.activationRequired ? [['Active-policy expected rank', role(row.activeExpected)], ['Active-policy source status', row.activeCause || 'Unconfirmed'], ['Proposed policy', 'Inactive Steward v3 — activation requires separate review; this view cannot repair roles.']] : []),
        ['Observed managed roles', names(row.actual)], ['Missing', names(row.missing)], ['Extra with acknowledged grant receipts', names(row.extraOwned)], ['Extra unowned / manual review', names(row.extraUnowned)],
        ['Historical effects', row.historyWithheld ? 'Withheld for the current privacy hold. Counts and completeness are unavailable; no absence or clear history is inferred.' : row.baselineGrantOnly ? `${row.unknown} attempted role changes with unknown results. A separate starting point permits new grants only. Ordinary rank removals for this account stay manual in Discord; separate ban and erasure rules still apply. Old history is unchanged.` : `${row.unknown} unresolved attempted effects; ${row.expiredUnattempted} expired unattempted intents; ${row.activeUnattempted || 0} unattempted pending operations. Related role-operation history is preserved.`],
        ['Retained history coverage', row.historyWithheld ? 'Withheld. Completeness is unavailable.' : row.historyTruncated ? 'Truncated. The full unknown count is shown, but an attended repair is unavailable until this history is reviewed.' : 'Bounded related role-operation history is complete for this account.'],
        ['Discord server joined', `${stamp(row.discordJoinedAt)} — Discord source; not native guild join time`],
        ['Legacy name-only roster observations', row.characters.map(c => `${c.name}: ${stamp(c.legacyNameFirstObservedAt)}`).join('; ') || 'No permitted linked records'],
        ['Native observation meaning', 'Not current character/GUID episode evidence, native guild join time or a grace clock. Current episode and actual join dates are unconfirmed.']].forEach(([label, value]) => { list.append(el('dt', label), el('dd', value)); });
      card.append(list);
      if ((row.manualPutHeld || row.refusedPutReview) && !row.sourceHeld && !row.historyWithheld && !row.historyTruncated && !row.activationRequired && !row.unknown && policy.value === 'active') {
        const preview = refusalPreviews.get(row.id);
        if (preview) {
          const facts = el('dl');
          [['Current supported rank', role(preview.expectedRole)], ['Roles read for this action', names(preview.observedRoles)], ['Refused operations retained', preview.refusedAttempts.map(r => `${r.id} · HTTP ${r.status} · ${stamp(r.checkedAt)}`).join('; ')], ["Roster export used for this action", `${preview.snapshotId} · ${stamp(preview.snapshotAt)}`], ['Maximum new grant attempts', String(preview.maxPlannedEffects)], ['Confirm before', stamp(preview.expiresAt)]].forEach(([label, value]) => { facts.append(el('dt', label), el('dd', value)); });
          card.append(facts);
        }
        const retry = el('button', preview ? preview.mode === 'record_present_role' ? 'Confirm current role observation' : 'Confirm one fresh grant' : 'Review refused grant');
        retry.disabled = busy || readWait() > 0 || refusalSpent.has(row.id); retry.addEventListener('click', () => preview ? confirmRefusedGrant(row) : reviewRefusedGrant(row));
        const reread = el('button', 'Read current account'), readMessage = el('p', 'This read checks current roles and retained operations. It sends no role change.');
        reread.disabled = busy || readWait() > 0; reread.addEventListener('click', () => review(row, reread, readMessage)); card.append(retry, reread, readMessage);
        if (refusalFocus?.id === row.id) focusTarget = refusalFocus.target === 'confirm' ? retry : reread;
      }
      if (outcomes.has(row.id)) card.append(el('p', outcomes.get(row.id), 'role-audit-outcome'));
      if (row.unknown > 0 && !row.sourceHeld && !row.historyTruncated && !row.activationRequired && !row.baselineGrantOnly && policy.value === 'active') {
        const preview = baselinePreviews.get(row.id), baselineButton = el('button', preview ? 'Accept new starting point — no role changes' : 'Review uncertain operation');
        if (preview) {
          const facts = el('dl');
          [['Roles read for this decision', names(preview.observedRoles)], ['Current supported rank', role(preview.expectedRole)], ['Original uncertain request', `${preview.receipt.desired === 1 ? 'Add' : 'Remove'} ${role(preview.receipt.roleId)} · ${stamp(preview.receipt.createdAt)} · ${preview.receipt.id}`], ["Roster export used for this decision", `${preview.snapshotId} · ${stamp(preview.snapshotAt)}`], ['Accept before', stamp(preview.expiresAt)]].forEach(([label, value]) => { facts.append(el('dt', label), el('dd', value)); });
          card.append(facts);
        }
        baselineButton.disabled = busy || readWait() > 0; baselineButton.addEventListener('click', () => preview ? adoptBaseline(row) : reviewBaseline(row)); card.append(baselineButton);
        const reread = el('button', 'Read current account'), readMessage = el('p', 'A fresh read checks whether a decision is already recorded. It sends no role change.');
        reread.disabled = busy || readWait() > 0; reread.addEventListener('click', () => review(row, reread, readMessage)); card.append(reread, readMessage);
      }
      if (row.repairable && !row.activationRequired && (!row.extraUnowned.length || row.baselineGrantOnly === true) && row.maxPlannedEffects === 2 && policy.value === 'active') {
        const button = el('button', row.reviewed ? row.baselineGrantOnly ? `Confirm fresh ${role(row.expected)} grant only` : `Confirm ${role(row.expected)} reconciliation (up to 2 planned changes)` : `Review reconciliation to ${role(row.expected)}`), message = el('p', row.baselineGrantOnly
          ? `Desired role: ${role(row.expected)}. This starting point permits a new grant only after a current verification check. It does not mark old roles as granted by the bot or plan an existing role for removal. The bot may undo only its own new grant if current permission or confirmation fails. Ordinary rank removals for this account stay manual in Discord; separate ban and erasure rules still apply. The old result stays unknown. No in-game promotion is requested.${row.reviewed ? ' Confirm before ' + stamp(row.confirmBy) + '.' : ''}`
          : `Desired role: ${role(row.expected)}. Observed acknowledged-grant removal candidates: ${names(row.extraOwned)}. These candidates still need the original writer's custody approval; its actual plan may differ. Up to two planned managed-role changes may occur: an acknowledged unwanted-role removal and/or the desired grant. If authority changes, an additional owned compensation may undo this action's grant. Other owned extras may remain after this bounded action. Review fetches this account again. The original token/source deadline lasts at most five minutes; confirmation is offered earlier to retain a conservative 112-second allowance for up to two jobs. This UI allowance grants no writer authority. No native promotion is requested.${row.reviewed ? ' Confirm before ' + stamp(row.confirmBy) + '; original token expires ' + stamp(row.previewExpiresAt) + '.' : ''}`);
        button.disabled = busy || readWait() > 0; button.addEventListener('click', () => row.reviewed ? repair(row, button, message) : review(row, button, message)); card.append(button, message);
      }
      fragment.append(card);
    }
    result.replaceChildren(fragment);
    if (!busy) { refusalFocus = null; focusTarget?.focus?.(); }
  }
  async function scanPages() {
    if (destroyed || busy || finished || readWait() > 0) return; clearReadPause(); paused = false; busy = true; lockInputs(true); scan.disabled = true; restart.disabled = true; pause.disabled = false;
    try {
      for (let chunk = 0; chunk < 250 && !paused && !destroyed; chunk++) {
        status.textContent = `Reading page ${pages + 1}… No role changes are being sent.`;
        const query = ['scope=' + encodeURIComponent(scope.value), policy.value === 'steward-v3' ? 'policyPreview=steward-v3' : '', cursor ? 'cursor=' + encodeURIComponent(cursor) : ''].filter(Boolean).join('&');
        const data = await api('GET', '/api/admin/role-audit' + (query ? '?' + query : ''));
        if (destroyed) return;
        if (!Array.isArray(data.rows) || !data.coverage || data.coverage.atomicSnapshot !== false) throw new Error('Audit coverage was not confirmed');
        if (data.comparisonScope !== undefined && data.comparisonScope !== scope.value) throw new Error('The comparison scope changed. Start a fresh read.');
        if (firstSource !== null && data.source?.id !== firstSource) throw new Error('The native roster changed during this traversal. Start fresh before comparing the whole server.');
        firstSource = data.source?.id ?? null;
        for (const item of data.managedRoles || []) labels.set(item.roleId, item.name);
        nativeLinkedCandidates = data.coverage.nativeLinkedCandidateSubjects;
        // Defense against cached/old responses: excluded identity rows never
        // enter the display cache or CSV, even if a stale API supplied one.
        let rejected = 0;
        for (const row of data.rows) { if (row.historyWithheld || row.cause === 'privacy_held' || row.pending || row.bot) { rejected++; continue; } rows.set(row.id, {...row, observedAt: Number.isSafeInteger(row.discordObservedAt) ? row.discordObservedAt : data.generatedAt, reviewed: false, previewToken: null}); }
        withheld += (data.counts?.withheldCandidates || 0) + rejected;
        pages++; processed += data.coverage.providerRowsProcessed || 0; providerRequests += data.coverage.providerRequests || 0; linkedUnavailable += data.coverage.linkedUnavailable || 0; observedOnly += data.coverage.observedOnly || 0;
        cursor = data.nextCursor; finished = data.coverage.complete === true && !cursor; render();
        if (data.coverage.completedPrefix === true || data.readPacing !== undefined) {
          if (data.coverage.completedPrefix !== true || finished || !cursor || cursor !== data.resumeCursor || !retainReadPause({status: 429, data})) throw new Error('Completed-prefix wait was not confirmed');
          paused = true; finished = !readPause.resumeAvailable; break;
        }
        if (finished) { status.textContent = 'Discord traversal finished. These are timestamped observations, not proof that every mismatch is resolved. Repairs require a fresh current preview.'; break; }
        if (!cursor) throw new Error('Continuation coverage was not confirmed');
      }
      if (!finished) status.textContent = paused ? 'Paused. Resume continues the same expiring traversal.' : 'Read limit reached. Resume the remaining pages while the traversal is valid.';
    } catch (error) {
      if (!destroyed && retainReadPause(error)) { paused = true; finished = !readPause.resumeAvailable; }
      else {
        if (!destroyed) status.textContent = `Coverage stopped: ${error?.data?.coverage?.gap || error?.data?.error || error?.message || 'request outcome unavailable'}. No automatic retry occurred. Start fresh when the source is available.`;
        // Unknown timing and expired/failed cursors are never replayed.
        paused = true; finished = true;
      }
    } finally {
      busy = false; if (!destroyed) { lockInputs(false); pause.disabled = true; scan.disabled = finished; restart.disabled = false; scan.textContent = pages ? 'Resume scan' : scanTitle(); render(); paintReadPause(); }
    }
  }
  scan.addEventListener('click', scanPages); pause.addEventListener('click', () => { paused = true; pause.disabled = true; });
  const reset = () => { if (busy || readWait() > 0) return; clearReadPause(); rows.clear(); labels.clear(); outcomes.clear(); baselinePreviews.clear(); refusalPreviews.clear(); refusalSpent.clear(); cursor = null; pages = processed = observedOnly = withheld = unavailableReads = providerRequests = linkedUnavailable = 0; firstSource = nativeLinkedCandidates = null; finished = false; paused = false; scan.disabled = false; scan.textContent = scanTitle(); status.textContent = 'Ready for a fresh read-only scan.'; render(); };
  restart.addEventListener('click', reset); policy.addEventListener('change', reset); scope.addEventListener('change', reset);
  filter.addEventListener('change', render); sort.addEventListener('change', render); search.addEventListener('input', render);
  exportButton.addEventListener('click', () => {
    const fields = ['Discord ID', 'Username', 'Display name', 'Native character', 'Native rank', 'Expected rank', 'Active-policy expected rank', 'Activation required', 'Observed managed roles', 'Missing', 'Extra with grant receipt', 'Extra unowned', 'Unknown effects', 'Source held', 'Observed UTC'];
    // Quoting alone does not make CSV cells literal. Preserve long snowflakes
    // as text and fence spreadsheet formula/control/Unicode-width prefixes.
    const safe = value => {
      let text = String(value ?? '');
      if (/^[\s\p{Cf}\u0000-\u001f\u007f]/u.test(text) || /^[=+\-@\uFF1D\uFF0B\uFF0D\uFF20\uFE66\uFE62\uFE63\uFE6B]/u.test(text) || /^[0-9]{16,}$/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const values = [...rows.values()].filter(r => !r.historyWithheld && r.cause !== 'privacy_held' && !r.pending && !r.bot).map(r => [r.id, r.username, r.displayName, r.nativeCharacter, r.nativeRank, role(r.expected), r.activationRequired ? role(r.activeExpected) : role(r.expected), !!r.activationRequired, names(r.actual), names(r.missing), names(r.extraOwned), names(r.extraUnowned), r.unknown, r.sourceHeld, new Date(r.observedAt * 1000).toISOString()]);
    const url = URL.createObjectURL(new Blob([[fields, ...values].map(row => row.map(safe).join(',')).join('\r\n')], {type: 'text/csv;charset=utf-8'}));
    const link = el('a'); link.href = url; link.download = 'private-discord-role-observations.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  });
  return {pause() { paused = true; }, destroy() { destroyed = true; paused = true; clearReadPause(); rows.clear(); outcomes.clear(); baselinePreviews.clear(); refusalPreviews.clear(); refusalSpent.clear(); container.replaceChildren(); }};
};

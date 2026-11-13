(function () {
  'use strict';
  // Launch discovery v235 view (round 5, 13 Nov 2026). Codex's roster-discovery contract
  // (stage2/launch-discovery235-prototype280/CONTRACT-01.json) adds the family officer-operations-v235 beside the strict
  // v234 page. This reader is separate: it never changes how a v234 page is read (launch-operations234.js stays as it
  // is), and app.js loads it only after a reply declares this family, so it is inert until the server sends one.
  // A qualified v235 page is the v234 page re-labelled with longer cursors (site-launch229.ts readDiscoveryOperations235),
  // so it goes through the unchanged v234 admission. A rank-held v235 page is the one new shape: all three rank fields
  // null, no promotion and no risk row, and exactly one of the contract's two rank-hold reasons. Presentation and shape
  // only: the server's seal over purpose, guild, bot, VERIFY and the captured policy is the authority, never this check.
  const PROTOCOL = 'officer-operations-v235';
  // The v235 discovery cursor (DISCOVERY_CURSOR_LIMIT235 = 8,192, the same alphabet). The generic v234 bound stays 4,096
  // in launch-operations234.js; this bound is chosen only because the reply declares this family.
  const PAGE_CURSOR_MAX = 8192, PAGE_CURSOR = /^[-_A-Za-z0-9]+\.[a-f0-9]{64}$/;
  const pageCursorShape = value => typeof value === 'string' && value.length <= PAGE_CURSOR_MAX && PAGE_CURSOR.test(value);
  const GUID = /^Player-\d{1,6}-[0-9A-Fa-f]{4,16}$/;
  const plain = value => !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
  const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
  const v234 = () => window.OlympusLaunch234;

  // The contract's closed set of rank-hold reasons (DiscoveryRankHold235), each with one plain sentence.
  const RANK_HELD = Object.freeze({
    'directive-rank-policy-held': 'Ranks are held because the site’s Discord rank settings do not use the 12 November ladder yet.',
    'native-rank-scheme-unconfirmed': 'Ranks are held because the latest roster export does not show the ten ranks of the 12 November ladder, or a member’s rank does not match its slot.',
  });
  const ROW_RANK_HELD = Object.freeze({
    'directive-rank-policy-held': 'Rank held: the site’s rank settings are not on the 12 November ladder yet',
    'native-rank-scheme-unconfirmed': 'Rank held: the roster export’s ranks are not confirmed',
  });
  // Hold codes only the v235 producer sends (held235 in site-launch229.ts); the others are explained by the v234 view.
  const HOLDS = Object.freeze({
    'directive-rank-policy-source-unconfirmed': 'The site could not confirm which Discord rank settings are in force, so nothing is shown.',
    'discovery-seal-unconfigured': 'The site’s Discord role settings for roster discovery are not set up.',
    'discovery-rank-hold-invalid': 'The roster export was held for a reason this page cannot show, so nothing is shown.',
    // Review of 13 Nov 2026 (finding 1): on this route the code also ends a rank-held page whose 60 second window passed
    // during the read (site-launch229.ts readDiscoveryOperations235), where no Discord role is read at all, so the v234
    // sentence ("before every Discord role was checked") would be untrue there. This one is true of both producers.
    'launch-read-window-exhausted': 'The read ran out of time before it finished, so nothing from it is shown.',
  });
  // Review of 13 Nov 2026 (finding 2): every held reply is built from projectLaunchOperations229(null, ...) (held229 in
  // site-launch229.ts), which lists these two codes once whatever the real reason is, and the server's own reason is
  // added after them. On a held page that carries no export, a code listed once is that default: the reply does not say
  // either way, so the page says so instead of stating a fact about an export it never showed. Listed twice, the code is
  // also the server's own reason (no export, or an export without the ten ranks) and keeps the v234 sentence.
  const NOT_REPORTED = Object.freeze({
    'native-snapshot-unavailable': 'This reply does not say whether there is a complete roster export from the last ten minutes.',
    'native-rank-scheme-unconfirmed': 'This reply does not say whether the roster export’s ranks match the 12 November ladder.',
  });
  const VERDICTS = Object.freeze({
    'family-changed': 'This page continues a scan that was read in another format. Start again from the first page.',
    'rank-held-malformed': 'This reply says ranks are held but still carries rank data, so nothing from it is shown.',
    'rank-held-unknown-reason': 'This reply says ranks are held without one reason this page recognises, so nothing from it is shown.',
    'rank-held-row-shape': 'A held member row in this reply is not in the expected form, so nothing from it is shown.',
    'rank-mode-changed': 'Ranks were held on one page of this scan and not on another. Start again from the first page.',
    'page-clock': 'The times in this reply do not fit together, so nothing from it is shown.',
    // Round 5 build (13 Nov 2026, codex-reviews-r5/discovery235.md section 5): every page of one scan has the same size,
    // export and scan, each page starts where the link said, and only the first page carries invites.
    'scan-changed': 'This page belongs to another scan or roster export than the page before it. Start again from the first page.',
    'page-offset': 'This page does not start where the link that asked for it pointed. Start again from the first page.',
    'invite-not-first-page': 'This reply lists invites on a page after the first, where they never appear, so nothing from it is shown.',
    // Review of 13 Nov 2026 (finding 3): the page's counts and the space-buffer rows.
    'page-counts': 'The member counts in this reply do not match its own rows, so nothing from it is shown.',
    'risk-row-shape': 'A row of the Initiate space buffer in this reply is not in the expected form, so nothing from it is shown.',
  });
  const refuse = code => ({ok: false, code, text: VERDICTS[code]});
  // Round 5 build (13 Nov 2026): the replies the real route sends when a page link can no longer be used
  // (site-launch229.ts readDiscoveryOperations235, and readLaunchPage229 for the inner link of a qualified page),
  // each as [HTTP status, sentence]. The page shows the sentence and offers the first page; it never retries on its own.
  const RESTART = Object.freeze({
    'invalid_discovery_cursor': [400, 'The link to the next page is no longer accepted, for example because the site’s settings changed. Start again from the first page.'],
    'discovery_cursor_capacity': [400, 'The site could not make the link for this page. This is a limit of the site, not something you did. Start again from the first page, and tell the site team if it happens again.'],
    'launch_cursor_source_changed': [409, 'The roster export or the site’s settings changed after this scan began. Start again from the first page.'],
    'invalid_launch_cursor': [400, 'The link to this page is no longer accepted. Start again from the first page.'],
    // readCursor229 sends this one code for a link that expired and for one it no longer accepts (review of 13 Nov 2026, finding 4).
    'expired_or_invalid_launch_cursor': [400, 'The link to this page has expired or is no longer accepted. Start again from the first page.'],
    'launch_cursor_role_source_changed': [409, 'The site’s Discord settings changed after this scan began. Start again from the first page.'],
  });
  /** The restart code of a refused read (an api() error with its status and body), or null for any other failure. */
  function restartCode(error) {
    const code = error && plain(error.data) && typeof error.data.error === 'string' ? error.data.error : null;
    return code && Object.hasOwn(RESTART, code) && error.status === RESTART[code][0] ? code : null;
  }
  const restartText = code => RESTART[code][1];
  function restartNotice(code, ui) {
    return ui.frame('Start again from the first page', null,
      ui.h('p', {'data-launch235-restart': code, text: restartText(code)}),
      ui.h('p', {class: 'muted small', text: 'Nothing was selected or sent. Pages read earlier in this scan are no longer shown. Use Refresh first page to begin a new scan.'}));
  }
  // Review of 13 Nov 2026 (finding 1): a later page of a scan can come back held (the read window ran out, or the export
  // changed during the read). That reply is the server's own and well formed, so it is shown with its own hold sentences;
  // it ends the scan, and this notice says so above it.
  function scanEndedNotice(ui) {
    return ui.frame('This scan stopped', null,
      ui.h('p', {'data-launch235-scan-ended': '', text: 'The site held this page, so the scan stopped here. The holds below say why. Start again from the first page.'}),
      ui.h('p', {class: 'muted small', text: 'Nothing was selected or sent. Pages read earlier in this scan are no longer shown. Use Refresh first page to begin a new scan.'}));
  }
  const SCAN_ENDED_STATUS = 'The site held this page, so the scan stopped. Start again from the first page.';
  // A risk row exactly as the producer projects it (launch-operations229.ts projectOperations229: an unverified Initiate
  // in slot 9, level 1-255 or unknown, days offline from 1 second to ten years or unknown), checked on v235 pages only
  // (review of 13 Nov 2026, finding 3); a v234 page keeps its own admission.
  const RISK_KEYS = 'currentSlot,guid,lastOnlineDays,level,name,reason,reviewOnly';
  const riskShape = r => plain(r) && Object.keys(r).sort().join(',') === RISK_KEYS && text(r.name, 96) && typeof r.guid === 'string' && GUID.test(r.guid)
    && r.currentSlot === 9 && r.reason === 'unverified-initiate' && r.reviewOnly === true
    && (r.level === null || Number.isInteger(r.level) && r.level >= 1 && r.level <= 255)
    && (r.lastOnlineDays === null || typeof r.lastOnlineDays === 'number' && Number.isFinite(r.lastOnlineDays) && r.lastOnlineDays > 0 && r.lastOnlineDays <= 3660);

  /** The rank-hold reason of a well-formed rank-held page, or null. */
  function rankHeldReason(d) {
    if (!plain(d) || d.protocol !== PROTOCOL || d.status !== 'partial' || d.rankProfile !== null || d.rankSchemeDigest !== null || d.rankNames !== null) return null;
    if (!Array.isArray(d.heldReasons)) return null;
    const found = d.heldReasons.filter(code => Object.hasOwn(RANK_HELD, code));
    return found.length === 1 ? found[0] : null;
  }
  // The page's own clocks fit the producer's rules (fetchedAt < expiresAt <= fetchedAt + 60, the scan window around the
  // read, the export before the read). No wall clock: the page script's server-skew clock decides freshness elsewhere.
  function clocksFit(d) {
    const s = d.scan, int = Number.isSafeInteger;
    // The page's own 60 second window ends no later than the scan's 600 second window: a page is never current longer
    // than its scan, and the scan's end is never read as the page's (review section 5, "page expiresAt is not scan.expiresAt").
    return int(d.fetchedAt) && int(d.expiresAt) && int(d.snapshotAt) && d.snapshotAt >= 1 && d.snapshotAt <= d.fetchedAt
      && d.fetchedAt < d.expiresAt && d.expiresAt <= d.fetchedAt + 60
      && plain(s) && int(s.startedAt) && int(s.expiresAt) && s.startedAt <= d.fetchedAt && d.fetchedAt < s.expiresAt && d.expiresAt <= s.expiresAt;
  }
  // A rank-held page counts exactly its own rows (review of 13 Nov 2026, finding 3; readDiscoveryOperations235): one held
  // row per member of the page, the page is the next 20 members (fewer only at the end), what is left is unscanned, the
  // roster size is the export's member count, the export has an id, and a next-page link exists exactly while members are left.
  function countsFit(d) {
    const e = d.entitlements, int = Number.isSafeInteger;
    if (!plain(e) || !int(e.offset) || !int(e.total) || !int(e.scanned) || !int(e.unscanned) || e.pageSize !== 20) return false;
    if (!int(d.snapshotId) || d.snapshotId < 1 || d.memberCount !== e.total || e.total < 1 || e.total > 1000 || e.offset < 0 || e.offset >= e.total) return false;
    return e.scanned === Math.min(20, e.total - e.offset) && e.unscanned === e.total - e.offset - e.scanned && Array.isArray(d.held) && d.held.length === e.scanned
      && (d.nextCursor === null) === (e.offset + e.scanned === e.total);
  }
  /** One scan: the same export, scan and roster size on every page; the page starts where its link pointed; invites on the first page only. */
  function scanFits(d, first, expectedOffset) {
    const e = d.entitlements;
    if (!plain(e) || !Number.isSafeInteger(e.offset) || !Number.isSafeInteger(e.total)) return 'page-offset';
    if (Number.isSafeInteger(expectedOffset) && e.offset !== expectedOffset) return 'page-offset';
    if (Array.isArray(d.invites) && d.invites.length && e.offset !== 0) return 'invite-not-first-page';
    if (first && first.status !== 'held') {
      const f = first.entitlements, fs = first.scan, s = d.scan;
      if (!plain(f) || f.total !== e.total || first.memberCount !== d.memberCount || first.snapshotId !== d.snapshotId || first.snapshotAt !== d.snapshotAt
        || !plain(fs) || !plain(s) || fs.id !== s.id || fs.startedAt !== s.startedAt || fs.expiresAt !== s.expiresAt) return 'scan-changed';
    }
    return null;
  }
  /**
   * Admission of one v235 page. `first` is the page it continues, or null; `expectedOffset` is where the link that asked
   * for it points (0 for the first page, the previous offset plus 20 for a next page, the page's own offset for a recheck).
   * Returns {ok:true} or {ok:false, code, text}. A reply of another family never reaches this function (app.js chooses
   * the reader by the declared family).
   */
  function assess(d, first, expectedOffset) {
    const L = v234();
    if (!L || !plain(d) || d.protocol !== PROTOCOL) return L ? L.assess(d, null) : refuse('family-changed');
    if (first && (!plain(first) || first.protocol !== PROTOCOL)) return refuse('family-changed');
    const fits = () => { const misfit = scanFits(d, first, expectedOffset); return misfit ? refuse(misfit) : null; };
    const nullTriple = d.rankProfile === null && d.rankSchemeDigest === null && d.rankNames === null;
    if (d.status === 'partial' && nullTriple) {
      if (!Array.isArray(d.promotions) || d.promotions.length !== 0 || !Array.isArray(d.riskBuffer) || d.riskBuffer.length !== 0) return refuse('rank-held-malformed');
      if (!Array.isArray(d.heldReasons) || d.heldReasons.length > 64 || d.heldReasons.some(code => !text(code, 120))) return refuse('rank-held-unknown-reason');
      const reason = rankHeldReason(d);
      if (!reason) return refuse('rank-held-unknown-reason');
      // The producer holds every member of the page under the page's one reason (projectRankHeldDiscovery235).
      if (!Array.isArray(d.held) || d.held.some(r => !plain(r) || Object.keys(r).sort().join(',') !== 'guid,name,reason' || !text(r.name, 96)
        || typeof r.guid !== 'string' || !GUID.test(r.guid) || r.reason !== reason)) return refuse('rank-held-row-shape');
      if (!clocksFit(d)) return refuse('page-clock');
      if (first && rankHeldReason(first) !== reason) return refuse('rank-mode-changed');
      // The scan's own reasons first (they name what changed between pages), then the page's own counts.
      return fits() || (countsFit(d) ? {ok: true, rankHeld: reason} : refuse('page-counts'));
    }
    // The copy keeps the reply's own prototype, so the v234 plain-object check sees exactly what it would see.
    const as234 = page => page && Object.assign(Object.create(Object.getPrototypeOf(page)), page, {protocol: L.PROTOCOL});
    if (d.status === 'held') {
      // Review of 13 Nov 2026 (finding 1): a held page is the server's own answer, also on a later page of a scan
      // (held235 after the read window, or the inner reader's held page re-labelled). It carries no scan, no export and no
      // row to compare with the page before it, so it gets the v234 admission on its own and ends the scan: the page
      // clears the earlier pages and shows this one with its own holds (app.js). Nothing on it can be acted on.
      const verdict = L.assess(as234(d), null);
      return verdict.ok ? {ok: true, rankHeld: null, scanEnded: !!first} : verdict;
    }
    if (first && rankHeldReason(first)) return refuse('rank-mode-changed');
    // Qualified pages: exactly the v234 admission, on a copy that carries the v234 label.
    const verdict = L.assess(as234(d), as234(first));
    if (!verdict.ok) return verdict;
    if (!clocksFit(d)) return refuse('page-clock');
    const misfit = fits();
    if (misfit) return misfit;
    if (!Number.isSafeInteger(d.snapshotId) || d.snapshotId < 1) return refuse('page-counts');
    // Our review of 13 Nov 2026 (LOW a): a qualified page ties its counts to the scan as a rank-held page does. The roster
    // size is the export's member count (readLaunchPage229 holds a page whose roster rows do not number that count) and
    // the page is 20 members (LAUNCH_ROLE_PAGE229); scanFits already keeps both the same on every page of the scan.
    if (d.memberCount !== d.entitlements.total || d.entitlements.pageSize !== 20) return refuse('page-counts');
    if (!Array.isArray(d.riskBuffer) || d.riskBuffer.some(r => !riskShape(r))) return refuse('risk-row-shape');
    return {ok: true, rankHeld: null};
  }

  const holdText = code => Object.hasOwn(RANK_HELD, code) ? RANK_HELD[code] : Object.hasOwn(HOLDS, code) ? HOLDS[code] : v234().holdText(code);
  const rowHoldText = code => Object.hasOwn(ROW_RANK_HELD, code) ? ROW_RANK_HELD[code] : v234().rowHoldText(code);
  /**
   * The holds of a page, each code once. On a rank-held page its rank reason is said once, in the rank frame, not again
   * here. On any other page the two rank codes keep the v234 view's sentences: there they come with a held or qualified
   * page (a held reply always lists the export and rank-table codes, held229 in site-launch229.ts), never with the
   * rank-held partial page the "Ranks are held because" sentences describe.
   */
  function holdList(codes, ui, d) {
    const reason = rankHeldReason(d), shown = [...new Set(codes)].filter(code => code !== reason);
    const notReported = code => plain(d) && d.status === 'held' && !d.guild && Object.hasOwn(NOT_REPORTED, code) && codes.filter(c => c === code).length === 1;
    const say = code => notReported(code) ? NOT_REPORTED[code] : !reason && Object.hasOwn(RANK_HELD, code) ? v234().holdText(code) : holdText(code);
    if (!shown.length) return ui.h('p', {class: 'muted small', text: reason ? 'No other holds on this read.' : 'No holds on this read.'});
    return ui.h('div', null, ui.h('h3', {text: 'Holds on this read'}),
      ui.h('ul', {class: 'launch234-holds'}, shown.map(code => ui.h('li', {'data-launch234-hold': code, text: say(code)}))));
  }
  function rankFrame(d, ui) {
    const reason = rankHeldReason(d);
    if (!reason) return v234().rankFrame(d, ui);
    return ui.frame('Ranks held on this read', null,
      ui.h('p', {'data-launch235-rank-held': reason, text: RANK_HELD[reason]}),
      // F4 of the review: with the settings held, the server does not report whether the export's ranks also match.
      reason === 'directive-rank-policy-held' ? ui.h('p', {'data-launch235-rank-also': '', text: 'The roster export’s ranks are checked only once the settings are fixed, so a second rank hold may appear then.'}) : null,
      // 13 Nov 2026: under the settings production runs (the original rank policy) verification, promotion and demotion
      // keep granting and removing rank roles; only this page's ranks and recommendations wait for the 12 November ladder.
      // Said for this reason only: with the 12 November settings in force and an export that does not match, role
      // changes are held as well.
      reason === 'directive-rank-policy-held' ? ui.h('p', {'data-launch235-rank-roles': '', text: 'This hold is about the ranks and the promotion recommendations on this page. Rank roles in Discord are not held by it: they keep following the site’s current rank settings. While those settings use the earlier rank names, renaming the in-game ranks first stops rank roles from changing until the settings are switched as well.'}) : null,
      ui.h('p', {text: 'Promotion recommendations are held until ranks are confirmed. This does not mean that nobody is due for a promotion. Roster discovery, the invite queue and the message of the day work as usual.'}),
      ui.h('p', {class: 'muted small', text: 'The Initiate space buffer needs ranks, so it stays empty while ranks are held.'}));
  }
  function promotionGroups(d, eligible, ui) {
    if (!rankHeldReason(d)) return v234().promotionGroups(d, eligible, ui);
    return [ui.h('p', {class: 'muted small', 'data-launch235-no-promotions': '', text: 'Promotion recommendations for this page are held while ranks are held; nobody on it is shown as due or not due. Its members are listed under Held evidence.'})];
  }
  // The two summary lines of the discovery frame, where the v234 wording would say something untrue of a v235 page:
  // a held page shows no roster at all, and a rank-held page counts members, not Discord role checks or recommendations.
  // null keeps the v234 wording (a qualified v235 page is a v234 page). Review of 13 Nov 2026: a held page can also come
  // after the export was read (the read window ran out, the export changed), so the line says what the reply carries.
  function scopeLine(d) {
    return d.status === 'held' && !d.guild ? 'This reply carries nothing from a roster export. The holds below say why.' : null;
  }
  function progressLine(d, c) {
    // Codex's reading of 13 Nov 2026: a held reply can follow a read that did run (the read window ran out, the export
    // changed during it), so the line says what the reply offers, not that nothing was done.
    if (d.status === 'held') return 'No confirmed rows are available from this read.';
    if (!rankHeldReason(d)) return null;
    return (c.complete ? 'Discovery complete' : 'Discovery partial') + ': ' + c.examined + ' of ' + c.total + ' roster members examined; ' + Math.max(0, c.total - c.examined)
      + ' unscanned. Promotion recommendations are held while ranks are held, so none are counted.';
  }
  // Codex's reading of 13 Nov 2026 (item 6): a rank-held page lists native roster members and reads no Discord role for
  // them (projectRankHeldDiscovery235; the first page's invites are read on their own), so its per-page words name the
  // roster page and how long it is current, never role evidence or role checks. null keeps the v234 words: a qualified
  // v235 page is a v234 page, and a held page has no examined page.
  const ROSTER_PAGE = Object.freeze({
    intro: 'Read-only discovery for up to 1,000 roster members. Scan follows at most 50 bounded pages when you ask. While ranks are held, each page lists roster members without promotion recommendations and is current for a short time. The addon rechecks GUID, guild, realm, rank and permission before each hardware action.',
    more: 'Load next 20 roster members',
    reading: 'Reading at most 20 roster members…',
    badge: current => current ? 'Roster page current' : 'Roster page stale',
    // e is the page's entitlements; until is its own expiry, already formatted; recheck says whether its scan still allows one.
    page: (e, until, current, recheck) => (e.scanned === 1 ? 'Roster member ' + (e.offset + 1) : 'Roster members ' + (e.offset + 1) + ' to ' + (e.offset + e.scanned)) + ' of ' + e.total + ', read from the roster export. '
      + (current ? 'This page is current until ' + until + '.' : 'This page was current until ' + until + '.' + (recheck ? ' Recheck it to read it again.' : '')),
    scan: until => 'This scan is current until ' + until + '. Recheck a page to read its roster members again.',
    expired: 'A roster page is no longer current. Recheck that page to read it again; nothing was read again or sent.',
    done: 'Read complete. While ranks are held, this page lists roster members and invites only.',
  });
  const rosterPage = d => rankHeldReason(d) ? ROSTER_PAGE : null;

  window.OlympusDiscovery235 = Object.freeze({
    PROTOCOL, PAGE_CURSOR_MAX, pageCursorShape, RANK_HELD_REASONS: Object.freeze(Object.keys(RANK_HELD)), assess, rankHeldReason,
    holdText, rowHoldText, holdList, rankFrame, promotionGroups, scopeLine, progressLine, rosterPage, restartCode, restartText, restartNotice,
    scanEndedNotice, SCAN_ENDED_STATUS, riskShape,
    // The rest of the view is the v234 view's own, unchanged.
    heldNotice: (verdict, ui) => v234().heldNotice(verdict, ui),
    inviteTable: (rows, fmtDateTime, ui) => v234().inviteTable(rows, fmtDateTime, ui),
    promotionShape: r => v234().promotionShape(r),
    inviteShape: (r, d) => v234().inviteShape(r, d),
  });
}());

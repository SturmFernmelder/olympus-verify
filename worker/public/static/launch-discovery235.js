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
  });
  const VERDICTS = Object.freeze({
    'family-changed': 'This page continues a scan that was read in another format. Start again from the first page.',
    'rank-held-malformed': 'This reply says ranks are held but still carries rank data, so nothing from it is shown.',
    'rank-held-unknown-reason': 'This reply says ranks are held without one reason this page recognises, so nothing from it is shown.',
    'rank-held-row-shape': 'A held member row in this reply is not in the expected form, so nothing from it is shown.',
    'rank-mode-changed': 'Ranks were held on one page of this scan and not on another. Start again from the first page.',
    'page-clock': 'The times in this reply do not fit together, so nothing from it is shown.',
  });
  const refuse = code => ({ok: false, code, text: VERDICTS[code]});

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
    return int(d.fetchedAt) && int(d.expiresAt) && int(d.snapshotAt) && d.snapshotAt >= 1 && d.snapshotAt <= d.fetchedAt
      && d.fetchedAt < d.expiresAt && d.expiresAt <= d.fetchedAt + 60
      && plain(s) && int(s.startedAt) && int(s.expiresAt) && s.startedAt <= d.fetchedAt && d.fetchedAt < s.expiresAt;
  }
  /**
   * Admission of one v235 page. `first` is the page it continues, or null. Returns {ok:true} or {ok:false, code, text}.
   * A reply of another family never reaches this function (app.js chooses the reader by the declared family).
   */
  function assess(d, first) {
    const L = v234();
    if (!L || !plain(d) || d.protocol !== PROTOCOL) return L ? L.assess(d, null) : refuse('family-changed');
    if (first && (!plain(first) || first.protocol !== PROTOCOL)) return refuse('family-changed');
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
      return {ok: true, rankHeld: reason};
    }
    if (first && rankHeldReason(first)) return refuse('rank-mode-changed');
    // Held and qualified pages: exactly the v234 admission, on a copy that carries the v234 label.
    // The copy keeps the reply's own prototype, so the v234 plain-object check sees exactly what it would see.
    const as234 = page => page && Object.assign(Object.create(Object.getPrototypeOf(page)), page, {protocol: L.PROTOCOL});
    const verdict = L.assess(as234(d), as234(first));
    if (!verdict.ok) return verdict;
    if (d.status !== 'held' && !clocksFit(d)) return refuse('page-clock');
    return {ok: true, rankHeld: null};
  }

  const holdText = code => Object.hasOwn(RANK_HELD, code) ? RANK_HELD[code] : Object.hasOwn(HOLDS, code) ? HOLDS[code] : v234().holdText(code);
  const rowHoldText = code => Object.hasOwn(ROW_RANK_HELD, code) ? ROW_RANK_HELD[code] : v234().rowHoldText(code);
  /** The holds of a page; on a rank-held page its rank reason is said once, in the rank frame, not again here. */
  function holdList(codes, ui, d) {
    const reason = rankHeldReason(d), shown = codes.filter(code => code !== reason);
    if (!shown.length) return ui.h('p', {class: 'muted small', text: reason ? 'No other holds on this read.' : 'No holds on this read.'});
    return ui.h('div', null, ui.h('h3', {text: 'Holds on this read'}),
      ui.h('ul', {class: 'launch234-holds'}, shown.map(code => ui.h('li', {'data-launch234-hold': code, text: holdText(code)}))));
  }
  function rankFrame(d, ui) {
    const reason = rankHeldReason(d);
    if (!reason) return v234().rankFrame(d, ui);
    return ui.frame('Ranks held on this read', null,
      ui.h('p', {'data-launch235-rank-held': reason, text: RANK_HELD[reason]}),
      ui.h('p', {text: 'No promotion is recommended until ranks are confirmed. Roster discovery, the invite queue and the message of the day work as usual.'}),
      ui.h('p', {class: 'muted small', text: 'The Initiate space buffer needs ranks, so it stays empty while ranks are held.'}));
  }
  function promotionGroups(d, eligible, ui) {
    if (!rankHeldReason(d)) return v234().promotionGroups(d, eligible, ui);
    return [ui.h('p', {class: 'muted small', 'data-launch235-no-promotions': '', text: 'No rank recommendation on this page while ranks are held. Its members are listed under Held evidence.'})];
  }

  window.OlympusDiscovery235 = Object.freeze({
    PROTOCOL, PAGE_CURSOR_MAX, pageCursorShape, RANK_HELD_REASONS: Object.freeze(Object.keys(RANK_HELD)), assess, rankHeldReason,
    holdText, rowHoldText, holdList, rankFrame, promotionGroups,
    // The rest of the view is the v234 view's own, unchanged.
    heldNotice: (verdict, ui) => v234().heldNotice(verdict, ui),
    inviteTable: (rows, fmtDateTime, ui) => v234().inviteTable(rows, fmtDateTime, ui),
    promotionShape: r => v234().promotionShape(r),
    inviteShape: (r, d) => v234().inviteShape(r, d),
  });
}());

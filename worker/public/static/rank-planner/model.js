(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OlympusStaffRankPlanner = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SCHEMA = 'olympus-rank-draft/v2';
  const LEGACY_SCHEMA = 'olympus-rank-draft/v1';
  const POLICY = 'Olympus owner: High Council native rank; Treasurer and Co-GM appointments; October 2026';
  const PERMISSIONS = ['all', 'bundle', 'promote', 'demote', 'invite', 'remove', 'speak', 'recruit', 'repair', 'gold', 'tabs', 'auth'];
  const RECOMMENDED = ['gm', 'highcouncil', 'officer', 'officeralt', 'raidlead', 'veteran', 'raider', 'member', 'alt', 'initiate'];
  const REFERENCE = Object.freeze({ minRanks: 2, maxRanks: 10, captainRankIndex: 1, protectRankIndex: 5, protectRankIndexInformationalOnly: true });
  const SOURCE_SHA256 = '40BC6DF51C769ADAEDE8A0F29E7483970644B79643C3DDE4B475BA5D9E41EAA8';
  const clone = value => JSON.parse(JSON.stringify(value));
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const sameKeys = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
  const fail = message => { throw new Error(message); };
  function catalogueMap(catalogue) {
    if (!Array.isArray(catalogue) || catalogue.length !== 27 || new Set(catalogue.map(rank => rank.id)).size !== 27) fail('The rank catalogue is incomplete.');
    return new Map(catalogue.map(rank => [rank.id, rank]));
  }
  function makeRank(template) {
    if (!template) fail('Choose a rank from the catalogue.');
    const permissions = Object.fromEntries(PERMISSIONS.map(key => [key, key === 'speak']));
    for (const key of PERMISSIONS) if (typeof template.perms[key] === 'boolean') permissions[key] = template.perms[key];
    if (template.id === 'gm') for (const key of PERMISSIONS) permissions[key] = true;
    else if (permissions.bundle || permissions.gold || permissions.tabs) permissions.auth = true;
    return {
      id: template.id,
      name: template.name,
      permissions,
      bank: { goldPerDay: 0, defaultStacksPerTabPerDay: 0, view: template.id === 'gm', deposit: template.id === 'gm', unlimited: template.id === 'gm' },
    };
  }
  function createDraft(catalogue, ids = RECOMMENDED) {
    const templates = catalogueMap(catalogue);
    const draft = {
      schema: SCHEMA,
      status: 'draft',
      title: 'Olympus rank ladder',
      source: { attachment: 'Forever Guild Rank Codex.html', sha256: SOURCE_SHA256, recommendationsOnly: true, policy: POLICY },
      review: { claudeCode: 'pending', codex: 'pending', liveChangesApplied: false },
      reference: { ...REFERENCE },
      bankLimitScope: 'Whole gold per day and a default item-stack limit per bank tab per day; confirm each real bank tab separately.',
      ranks: ids.map(id => {
        const rank = makeRank(templates.get(id));
        // The current Olympus preset supplements the historical catalogue. Custom
        // and imported drafts retain their own choices; no live permission is applied.
        if (ids.length === RECOMMENDED.length && ids.every((value, index) => value === RECOMMENDED[index]) && id === 'veteran') {
          rank.permissions.invite = true;
          rank.permissions.repair = true;
        }
        return rank;
      }),
    };
    assertValid(draft, catalogue);
    return draft;
  }
  function validate(draft, catalogue) {
    const issues = [];
    const add = text => issues.push(text);
    const templates = catalogueMap(catalogue);
    if (!sameKeys(draft, ['schema', 'status', 'title', 'source', 'review', 'reference', 'bankLimitScope', 'ranks'])) return ['Import a rank draft exported by this planner.'];
    if (![SCHEMA, LEGACY_SCHEMA].includes(draft.schema) || draft.status !== 'draft') add('This planner accepts draft plans only.');
    if (typeof draft.title !== 'string' || draft.title.trim().length < 1 || draft.title.length > 100 || /[\u0000-\u001f\u007f]/.test(draft.title)) add('Give the plan a title between 1 and 100 characters.');
    const sourceKeys = draft.schema === LEGACY_SCHEMA ? ['attachment', 'sha256', 'recommendationsOnly'] : ['attachment', 'sha256', 'recommendationsOnly', 'policy'];
    if (!sameKeys(draft.source, sourceKeys) || draft.source.attachment !== 'Forever Guild Rank Codex.html' || draft.source.sha256 !== SOURCE_SHA256 || draft.source.recommendationsOnly !== true || (draft.schema === SCHEMA && draft.source.policy !== POLICY)) add('The source reference must remain attached to this draft.');
    if (draft.schema === LEGACY_SCHEMA && Array.isArray(draft.ranks) && draft.ranks.some(rank => rank && rank.id === 'highcouncil')) add('Use the current recommendation for a High Council draft with its owner-policy reference.');
    if (!sameKeys(draft.review, ['claudeCode', 'codex', 'liveChangesApplied']) || draft.review.claudeCode !== 'pending' || draft.review.codex !== 'pending' || draft.review.liveChangesApplied !== false) add('Exported drafts must show pending review and no live changes.');
    if (!sameKeys(draft.reference, Object.keys(REFERENCE)) || Object.entries(REFERENCE).some(([key, value]) => draft.reference[key] !== value)) add('Keep the documented rank limits and integration references.');
    if (draft.bankLimitScope !== 'Whole gold per day and a default item-stack limit per bank tab per day; confirm each real bank tab separately.') add('Bank limits must retain their draft scope.');
    if (!Array.isArray(draft.ranks)) return [...issues, 'The plan must contain a rank list.'];
    if (draft.ranks.length < 2 || draft.ranks.length > 10) add('A ladder needs between 2 and 10 ranks.');
    if (!draft.ranks[0] || draft.ranks[0].id !== 'gm') add('Guild Master must remain first.');
    const ids = new Set();
    const names = new Set();
    draft.ranks.forEach((rank, index) => {
      const slot = index + 1;
      if (!sameKeys(rank, ['id', 'name', 'permissions', 'bank'])) { add(`Rank ${slot} has an unexpected format.`); return; }
      if (typeof rank.id !== 'string' || !templates.has(rank.id)) add(`Rank ${slot} must come from the catalogue.`);
      if (ids.has(rank.id)) add(`Rank ${slot} repeats a rank already in the ladder.`);
      ids.add(rank.id);
      if (index > 0 && rank.id === 'gm') add('Guild Master can appear only once, in the first position.');
      if (typeof rank.name !== 'string' || rank.name.trim() !== rank.name || rank.name.length < 1 || rank.name.length > 40 || /[\u0000-\u001f\u007f]/.test(rank.name)) add(`Rank ${slot} needs a name between 1 and 40 characters.`);
      else {
        const folded = rank.name.normalize('NFKC').toLowerCase();
        if (names.has(folded)) add(`Rank ${slot} repeats a rank name.`);
        names.add(folded);
      }
      if (!sameKeys(rank.permissions, PERMISSIONS) || PERMISSIONS.some(key => typeof rank.permissions[key] !== 'boolean')) add(`Rank ${slot} needs an on or off choice for every permission.`);
      else {
        if (index === 0 && PERMISSIONS.some(key => rank.permissions[key] !== true)) add('Guild Master retains full authority.');
        if (index > 0 && rank.permissions.all) add(`Only Guild Master may have all permissions (rank ${slot}).`);
        if (index === draft.ranks.length - 1 && rank.permissions.auth) add('The final rank cannot require an authenticator. Keep an unprotected entry rank last.');
      }
      if (!sameKeys(rank.bank, ['goldPerDay', 'defaultStacksPerTabPerDay', 'view', 'deposit', 'unlimited'])) add(`Rank ${slot} needs explicit bank limits.`);
      else {
        for (const key of ['goldPerDay', 'defaultStacksPerTabPerDay']) if (!Number.isSafeInteger(rank.bank[key]) || rank.bank[key] < 0) add(`Rank ${slot}: bank limits must be nonnegative whole numbers.`);
        for (const key of ['view', 'deposit', 'unlimited']) if (typeof rank.bank[key] !== 'boolean') add(`Rank ${slot}: bank permissions must be on or off.`);
        if (rank.bank.unlimited !== (index === 0)) add('Unlimited bank access belongs to Guild Master only.');
        if (index === 0 && (!rank.bank.view || !rank.bank.deposit || rank.bank.goldPerDay !== 0 || rank.bank.defaultStacksPerTabPerDay !== 0)) add('Keep the Guild Master bank defaults; its authority is unlimited.');
        if (!rank.bank.view && rank.bank.defaultStacksPerTabPerDay > 0) add(`Rank ${slot}: item withdrawals need permission to view the bank tab.`);
        if (!rank.bank.view && rank.bank.deposit) add(`Rank ${slot}: deposits need permission to view the bank tab.`);
        if (index > 0 && rank.bank.goldPerDay > 0 && object(rank.permissions) && !rank.permissions.gold && !rank.permissions.repair) add(`Rank ${slot}: a gold limit needs repair or gold-withdrawal permission.`);
      }
    });
    return issues;
  }
  function assertValid(draft, catalogue) {
    const issues = validate(draft, catalogue);
    if (issues.length) fail(issues[0]);
    return draft;
  }
  function change(draft, catalogue, operation) {
    assertValid(draft, catalogue);
    const next = clone(draft);
    operation(next);
    return assertValid(next, catalogue);
  }
  function addRank(draft, catalogue, id) {
    return change(draft, catalogue, next => {
      if (next.ranks.length >= 10) fail('The ladder already uses all 10 rank slots.');
      if (next.ranks.some(rank => rank.id === id)) fail('That rank is already in the ladder.');
      const rank = makeRank(catalogueMap(catalogue).get(id));
      if (id === 'highcouncil' && next.schema === LEGACY_SCHEMA) {
        next.schema = SCHEMA;
        next.source.policy = POLICY;
      }
      // Keep the entry rank at the bottom. Authenticator-enabled ranks cannot occupy it.
      next.ranks.splice(next.ranks.length - 1, 0, rank);
    });
  }
  function removeRank(draft, catalogue, index) {
    return change(draft, catalogue, next => {
      if (!Number.isInteger(index) || index <= 0 || index >= next.ranks.length) fail('Guild Master cannot be removed.');
      if (next.ranks.length <= 2) fail('Keep at least Guild Master and one entry rank.');
      next.ranks.splice(index, 1);
    });
  }
  function moveRank(draft, catalogue, index, direction) {
    return change(draft, catalogue, next => {
      const destination = index + direction;
      if (!Number.isInteger(index) || ![-1, 1].includes(direction) || index <= 0 || destination <= 0 || index >= next.ranks.length || destination >= next.ranks.length) fail('Guild Master stays first; move another rank within the ladder.');
      [next.ranks[index], next.ranks[destination]] = [next.ranks[destination], next.ranks[index]];
    });
  }
  function updateRank(draft, catalogue, index, update) {
    return change(draft, catalogue, next => {
      if (!Number.isInteger(index) || index <= 0 || index >= next.ranks.length) fail('Guild Master keeps its full authority.');
      next.ranks[index] = { ...next.ranks[index], ...update };
    });
  }
  function parseWholeNumber(text) {
    if (typeof text !== 'string' || !/^(0|[1-9]\d*)$/.test(text) || !Number.isSafeInteger(Number(text))) fail('Enter a nonnegative whole number without punctuation.');
    return Number(text);
  }
  function importDraft(text, catalogue) {
    if (typeof text !== 'string' || text.length > 100000) fail('Choose a draft file smaller than 100 KB.');
    let parsed;
    try { parsed = JSON.parse(text); } catch { fail('The draft file could not be read. Choose a valid JSON export.'); }
    return clone(assertValid(parsed, catalogue));
  }
  function exportDraft(draft, catalogue) { return JSON.stringify(assertValid(draft, catalogue), null, 2) + '\n'; }
  function compatibility(draft) {
    const captain = draft.ranks[1];
    return {
      captainCompatible: Boolean(captain && captain.id === 'officer' && captain.permissions.bundle),
      captainName: captain ? captain.name : 'Missing',
      captainRankIndex: 1,
      protectedRankName: draft.ranks[5] ? draft.ranks[5].name : 'No rank in that position',
      protectRankIndex: 5,
      informationalOnly: true,
    };
  }
  function notices(draft) {
    const out = [];
    if (draft.schema === LEGACY_SCHEMA) out.push({ level: 'info', text: 'Your earlier draft is preserved. Use Olympus recommendation to replace it with the current High Council ladder.' });
    if (draft.ranks.some(rank => rank.id === 'highcouncil')) out.push({ level: 'info', text: 'Treasurer and Co-GM are appointments in the Olympus preset. High Council gold-withdrawal and bank-tab rights apply to every character at that rank. Review all allowances with the Guild Master.' });
    const result = compatibility(draft);
    if (!result.captainCompatible) out.push({ level: 'warning', text: `The community addon treats the second rank as Captain. ${result.captainName} is there now; review that authority before adopting this ladder.` });
    draft.ranks.slice(1).forEach(rank => {
      if ((rank.permissions.bundle || rank.permissions.gold || rank.permissions.tabs) && !rank.permissions.auth) out.push({ level: 'warning', text: `${rank.name} has sensitive permissions without an authenticator requirement.` });
    });
    out.push({ level: 'info', text: `Protected-rank reference: ${result.protectedRankName} (index 5). This is a review note only.` });
    return out;
  }
  return { SCHEMA, LEGACY_SCHEMA, POLICY, PERMISSIONS, RECOMMENDED, REFERENCE, SOURCE_SHA256, createDraft, makeRank, validate, assertValid, addRank, removeRank, moveRank, updateRank, parseWholeNumber, importDraft, exportDraft, compatibility, notices };
});

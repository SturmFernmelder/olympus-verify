(function () {
  'use strict';
  const plannerRoot = document.querySelector('[data-olympus-rank-planner]');
  if (!plannerRoot) return;
  const Model = window.OlympusStaffRankPlanner;
  const catalogue = window.OlympusStaffRankCatalogue.ranks;
  const byId = new Map(catalogue.map(rank => [rank.id, rank]));
  const storageKey = 'olympus-admin-rank-draft-v1:' + plannerRoot.dataset.draftOwner;
  const $ = id => plannerRoot.querySelector('#' + id);
  const categories = { leadership: 'Leadership', officer: 'Officer role', progression: 'Raid roster', community: 'Community', utility: 'Utility' };
  const labels = { bundle: 'Officer bundle', promote: 'Promote members', demote: 'Demote members', invite: 'Invite members', remove: 'Remove members', speak: 'Speak in guild chat', recruit: 'Recruitment', repair: 'Guild bank repairs', gold: 'Withdraw gold', tabs: 'Modify bank tabs', auth: 'Require an authenticator' };
  let draft = Model.createDraft(catalogue);
  let selectedId = 'highcouncil';
  let exportText = '';
  let storageAvailable = true;
  let feedbackTimer;
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const rankIconKeys = {"highcouncil":"leader","gm":"pos-guild_master","cogm":"pos-co_gm","officer":"pos-officer","officeralt":"assist","treasurer":"pos-treasurer","raidlead":"pos-raid_leader","classlead":"pos-class_lead","recruiter":"pos-recruitment","moderator":"pos-moderator","lootcouncil":"pos-loot_council","eventofficer":"icon-clock","pvplead":"pos-pvp_leader","mentor":"role-guide","veteran":"leader","coreraider":"pos-raider","raider":"role-dps","trialraider":"role-flex","bench":"waiting","member":"pos-member","social":"pos-community","trial":"icon-apply","initiate":"pos-member","alt":"assist","crafter":"pos-professions","inactive":"waiting","muted":"not-ready"};

  function rankIcon(id) {
    const image = element('img', 'rank-image');
    image.src = '/static/wow/' + (rankIconKeys[id] || 'pos-unknown') + '.png';
    image.alt = ''; image.width = 28; image.height = 28;
    return image;
  }
  function feedback(message, error = false) {
    $('feedback').textContent = message;
    $('feedback').classList.toggle('error', error);
    $('editor-feedback').textContent = $('editor').open ? message : '';
    $('editor-feedback').classList.toggle('error', error);
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => { $('feedback').textContent = ''; }, 6000);
  }
  function save() {
    try { localStorage.setItem(storageKey, Model.exportDraft(draft, catalogue)); }
    catch { storageAvailable = false; }
    $('storage-note').textContent = storageAvailable ? 'Saved in this browser.' : 'Browser storage is unavailable. Export your draft to keep it.';
  }
  function restore() {
    let raw;
    try {
      raw = localStorage.getItem(storageKey);
    } catch {
      storageAvailable = false;
      $('storage-note').textContent = 'Browser storage is unavailable. Export your draft to keep it.';
      return;
    }
    try {
      if (raw) draft = Model.importDraft(raw, catalogue);
      else save();
    } catch (error) {
      feedback(`A saved draft could not be restored: ${error.message} The Olympus recommendation is shown instead.`, true);
      $('storage-note').textContent = 'The previous saved draft failed validation. Edit or export the valid recommendation shown here.';
      // Preserve the invalid previous value until a valid draft is deliberately changed.
    }
  }
  function commit(next, message) {
    draft = next;
    if (!draft.ranks.some(rank => rank.id === selectedId)) selectedId = draft.ranks[1].id;
    save();
    render();
    if (message) feedback(message);
  }
  function perform(operation, message) {
    try { commit(operation(), message); } catch (error) { feedback(error.message, true); }
  }
  function permissionSummary(rank) {
    if (rank.permissions.all) return 'Full guild authority';
    const parts = ['bundle', 'invite', 'remove', 'repair', 'gold', 'tabs'].filter(key => rank.permissions[key]).map(key => labels[key]);
    if (!rank.permissions.speak) parts.push('Guild chat: muted');
    return parts.length ? parts.join(' · ') : 'Community access';
  }
  function can(operation) { try { operation(); return { allowed: true }; } catch (error) { return { allowed: false, reason: error.message }; } }
  function button(text, className, callback, options = {}) {
    const node = element('button', className, text);
    node.type = 'button';
    node.disabled = options.disabled === true;
    if (options.label) node.setAttribute('aria-label', options.label);
    if (options.title) node.title = options.title;
    node.addEventListener('click', callback);
    return node;
  }
  function renderCards() {
    const query = $('search').value.trim().toLowerCase();
    const category = $('category').value;
    const sort = $('sort').value;
    const list = catalogue.filter(rank => (category === 'all' || rank.cat === category) && (!query || [rank.name, rank.aliases.join(' '), rank.purpose, rank.note].join(' ').toLowerCase().includes(query)));
    list.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'cited' ? b.src.length - a.src.length || a.tier - b.tier : a.tier - b.tier);
    const fragment = document.createDocumentFragment();
    for (const template of list) {
      const included = draft.ranks.some(rank => rank.id === template.id);
      const card = element('article', `rank-card${included ? ' included' : ''}`);
      const head = element('div', 'card-head');
      head.append(rankIcon(template.id), element('h3', '', template.name), element('span', `category ${template.cat}`, categories[template.cat]));
      card.append(head);
      if (template.aliases.length) card.append(element('p', 'aliases', template.aliases.join(' · ')));
      card.append(element('p', 'purpose', template.purpose));
      const bottom = element('div', 'card-bottom');
      bottom.append(element('span', 'citation', template.origin || `${template.src.length} of 15 earlier drafts`));
      if (included) bottom.append(button('In your ladder', 'button quiet', () => { selectedId = template.id; render(); $('editor-feedback').textContent = ''; $('editor').showModal(); }, { label: `Review ${template.name} in your ladder` }));
      else bottom.append(button('Add rank', 'button small', () => perform(() => Model.addRank(draft, catalogue, template.id), `${template.name} added above the entry rank.`), { disabled: draft.ranks.length >= 10, label: `Add ${template.name}`, title: draft.ranks.length >= 10 ? 'All 10 slots are in use. Remove a rank first.' : '' }));
      card.append(bottom);
      fragment.append(card);
    }
    if (!list.length) fragment.append(element('p', 'empty-state', 'No ranks match that search. Try a different name or purpose.'));
    $('cards').replaceChildren(fragment);
    $('result-count').textContent = `${list.length} / ${catalogue.length}`;
  }
  function renderLadder() {
    $('ladder-count').textContent = `${draft.ranks.length} / 10`;
    $('plan-title').value = draft.title;
    $('slot-meter').replaceChildren(...Array.from({ length: 10 }, (_, i) => element('span', i < draft.ranks.length ? 'filled' : '')));
    const fragment = document.createDocumentFragment();
    draft.ranks.forEach((rank, index) => {
      const row = element('li', `ladder-row${rank.id === selectedId ? ' selected' : ''}`);
      row.append(element('span', 'rank-number', String(index + 1)));
      const choice = button('', 'rank-choice', () => { selectedId = rank.id; renderLadder(); renderEditor(); $('editor-feedback').textContent = ''; $('editor').showModal(); }, { label: `Review ${rank.name}, rank ${index + 1}` });
      choice.setAttribute('aria-pressed', String(rank.id === selectedId));
      choice.append(rankIcon(rank.id), element('span', 'rank-name', rank.name), element('span', 'rank-summary', index === 0 ? 'Fixed leadership rank' : index === draft.ranks.length - 1 ? 'Entry rank · authenticator off' : permissionSummary(rank)));
      row.append(choice);
      const actions = element('span', 'row-actions');
      for (const [symbol, direction, name] of [['Up', -1, 'up'], ['Down', 1, 'down']]) { // .112: words, not arrow glyphs (the official set has no arrow art)
        const operation = () => Model.moveRank(draft, catalogue, index, direction);
        const availability = can(operation);
        actions.append(button(symbol, 'icon-button', () => perform(operation, `${rank.name} moved ${name}.`), { disabled: !availability.allowed, title: availability.reason, label: `Move ${rank.name} ${name}` }));
      }
      const remove = () => Model.removeRank(draft, catalogue, index);
      const availability = can(remove);
      actions.append(button('', 'close-button remove', () => perform(remove, `${rank.name} removed from the draft.`), { disabled: !availability.allowed, title: availability.reason, label: `Remove ${rank.name}` }));
      row.append(actions);
      fragment.append(row);
    });
    $('ladder-list').replaceChildren(fragment);
    const notices = Model.notices(draft);
    $('notices').replaceChildren(...notices.map(note => element('li', note.level, note.text)));
  }
  function checkbox(id, text, checked, disabled = false) {
    const label = element('label', 'checkbox');
    const input = element('input');
    input.type = 'checkbox'; input.id = id; input.checked = checked; input.disabled = disabled;
    label.append(input, element('span', '', text));
    return label;
  }
  function numericField(id, text, value) {
    const label = element('label', 'field', text);
    const input = element('input');
    input.type = 'text'; input.inputMode = 'numeric'; input.pattern = '(0|[1-9][0-9]*)'; input.id = id; input.value = String(value); input.autocomplete = 'off';
    label.append(input);
    return label;
  }
  function renderEditor() {
    const index = draft.ranks.findIndex(rank => rank.id === selectedId);
    const rank = draft.ranks[index];
    if (!rank) return;
    const template = byId.get(rank.id);
    $('editor-title').textContent = rank.name;
    $('editor-position').textContent = `Rank ${index + 1} of ${draft.ranks.length}`;
    const content = element('div');
    content.append(element('p', 'editor-purpose', template.purpose));
    const source = element('details', 'source-details');
    source.append(element('summary', '', 'Read the source recommendation'), element('p', '', template.note), element('p', 'muted', `Suggested bank access: ${template.limits}`));
    content.append(source);
    if (index === 0) { content.append(element('p', 'gm-note', 'Guild Master keeps full guild authority and unlimited bank access. Its position and permissions stay fixed.')); $('editor-content').replaceChildren(content); return; }
    const form = element('form');
    form.noValidate = true;
    const nameLabel = element('label', 'field', 'Rank name');
    const nameInput = element('input'); nameInput.id = 'edit-name'; nameInput.type = 'text'; nameInput.maxLength = 40; nameInput.value = rank.name;
    nameLabel.append(nameInput); form.append(nameLabel);
    const groups = element('div', 'editor-grid');
    const permissions = element('fieldset', 'permissions');
    permissions.append(element('legend', '', 'Guild permissions'));
    for (const key of Model.PERMISSIONS.filter(key => key !== 'all')) permissions.append(checkbox(`perm-${key}`, labels[key], rank.permissions[key], key === 'auth' && index === draft.ranks.length - 1));
    permissions.append(element('p', 'field-hint', 'The Officer bundle includes officer channels, notes, MOTD, guild information, message and event moderation, guild-finder duties and the Discord link.'));
    const bank = element('fieldset', 'bank-fields');
    bank.append(element('legend', '', 'Bank allowance'));
    bank.append(numericField('bank-gold', 'Gold per day', rank.bank.goldPerDay), numericField('bank-stacks', 'Default item stacks per tab, per day', rank.bank.defaultStacksPerTabPerDay));
    bank.append(checkbox('bank-view', 'View bank tabs', rank.bank.view), checkbox('bank-deposit', 'Deposit into bank tabs', rank.bank.deposit));
    bank.append(element('p', 'field-hint', 'Use whole numbers. Zero grants no withdrawals. The stack allowance is a draft default; confirm every actual tab and its access separately.'));
    groups.append(permissions, bank); form.append(groups);
    const saveButton = element('button', 'button primary', 'Save rank choices'); saveButton.type = 'submit'; form.append(saveButton);
    form.addEventListener('submit', event => {
      event.preventDefault();
      perform(() => {
        const nextPermissions = { ...rank.permissions };
        for (const key of Model.PERMISSIONS.filter(key => key !== 'all')) nextPermissions[key] = $(`perm-${key}`).checked;
        const nextBank = { ...rank.bank, goldPerDay: Model.parseWholeNumber($('bank-gold').value), defaultStacksPerTabPerDay: Model.parseWholeNumber($('bank-stacks').value), view: $('bank-view').checked, deposit: $('bank-deposit').checked };
        return Model.updateRank(draft, catalogue, index, { name: $('edit-name').value.trim(), permissions: nextPermissions, bank: nextBank });
      }, 'Rank choices saved to your draft.');
    });
    content.append(form);
    $('editor-content').replaceChildren(content);
  }
  function render() { renderCards(); renderLadder(); renderEditor(); }
  restore();
  if (!draft.ranks.some(rank => rank.id === selectedId)) selectedId = draft.ranks[1].id;
  render();
  for (const id of ['search', 'category', 'sort']) $(id).addEventListener(id === 'search' ? 'input' : 'change', renderCards);
  $('plan-title').addEventListener('change', () => perform(() => Model.assertValid({ ...draft, title: $('plan-title').value.trim() }, catalogue), 'Plan name saved.'));
  $('recommended').addEventListener('click', () => perform(() => Model.createDraft(catalogue), 'Olympus recommendation loaded. Bank withdrawals start at zero until you set your allowances.'));
  $('minimum').addEventListener('click', () => perform(() => Model.createDraft(catalogue, ['gm', 'initiate']), 'Started with Guild Master and Initiate.'));
  $('import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 100000) feedback('Choose a draft file smaller than 100 KB.', true);
    else { try { const text = await file.text(); perform(() => Model.importDraft(text, catalogue), 'Draft imported.'); } catch (error) { feedback(`The file could not be opened: ${error.message}`, true); } }
    event.target.value = '';
  });
  $('export').addEventListener('click', () => {
    try { exportText = Model.exportDraft(draft, catalogue); $('export-text').value = exportText; $('copy').textContent = 'Copy draft'; $('export-dialog').showModal(); }
    catch (error) { feedback(error.message, true); }
  });
  $('close-export').addEventListener('click', () => $('export-dialog').close());
  $('close-editor').addEventListener('click', () => $('editor').close());
  $('download').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([exportText], { type: 'application/json' }));
    const link = element('a'); link.href = url; link.download = 'olympus-rank-draft.json'; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(exportText); $('copy').textContent = 'Copied'; }
    catch { $('export-text').focus(); $('export-text').select(); $('copy').textContent = 'Text selected — copy manually'; }
  });
})();

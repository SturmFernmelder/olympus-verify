(function () {
  'use strict';
  const protocol = window.OlympusGuildQRProtocol;
  const allowedGuild = name => name === 'Olympus' || /^Olympus (?:I|II|III|IV|V|VI|VII|VIII|IX|X)$/.test(name);
  const labels = Object.freeze({classes: ['Warrior', 'Paladin', 'Hunter', 'Rogue', 'Priest', 'Shaman', 'Mage', 'Warlock', 'Druid'], levels: ['Levels 1–9', 'Levels 10–19', 'Levels 20–29', 'Levels 30–39', 'Levels 40–49', 'Levels 50–59', 'Level 60'], ranks: Array.from({length: 10}, (_, index) => 'Rank position ' + index)});
  const count = value => value === 'few' ? 'Fewer than 5' : value === null ? 'Unavailable' : String(value);
  const time = value => new Date(value * 1000).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'});
  function node(tag, text, cls) { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; if (cls) item.className = cls; return item; }
  function details(parent, title, values, names) {
    const section = node('details'); section.append(node('summary', title));
    if (values === null) section.append(node('p', 'Withheld. At least one bucket was small or unavailable; no remainder is exposed.', 'help'));
    else {
      const table = node('table', undefined, 'distribution'); table.append(node('caption', title + ' · reported characters'));
      const head = node('thead'), heading = node('tr'); heading.append(node('th', 'Group'), node('th', 'Characters')); head.append(heading); table.append(head);
      const body = node('tbody'); values.forEach((value, index) => { const row = node('tr'); row.append(node('td', names[index]), node('td', count(value))); body.append(row); }); table.append(body); section.append(table);
    }
    parent.append(section);
  }
  function card(snapshot, evaluatedAt) {
    const guild = snapshot.guilds[0], article = node('article', undefined, 'army-card'), stale = evaluatedAt - snapshot.observedAt > 86400 || evaluatedAt - guild.receivedAt > 86400;
    article.append(node('span', stale ? 'Stale community observation' : 'Unverified community observation', 'source-label'), node('h2', guild.name), node('p', snapshot.realmGroup + ' · ' + snapshot.faction, 'muted'));
    const figures = node('dl', undefined, 'figures');
    for (const [label, value] of [[stale ? 'Last reported characters' : 'Reported characters', guild.reportedCharacters], ['Reported online', evaluatedAt - guild.receivedAt > 900 ? null : guild.online]]) { const item = node('div'); item.append(node('dt', label), node('dd', count(value))); figures.append(item); }
    article.append(figures);
    const metadata = node('dl', undefined, 'metadata');
    for (const [label, value] of [['Source observation', time(snapshot.observedAt)], ['Guild data received', time(guild.receivedAt)], ['Source status', stale ? 'Historical report · source older than 24 hours' : evaluatedAt - guild.receivedAt > 900 ? 'Online count no longer current' : 'Within the source freshness window']]) { const item = node('div'); item.append(node('dt', label), node('dd', value)); metadata.append(item); }
    article.append(metadata);
    for (const key of ['classes', 'levels', 'ranks']) details(article, key === 'classes' ? 'Classes' : key === 'levels' ? 'Level bands' : 'In-game rank positions', guild[key], labels[key]);
    article.append(node('p', 'Characters, not unique people. This report proves neither game origin nor membership. Rank positions carry no authority on this site.', 'help'));
    return article;
  }
  // Shared renderer accepts only an already validated aggregate; it never reads an account or member API.
  window.OlympusArmyCards = Object.freeze({card});
  // Standalone Army documents share the main site's disclosure behavior without its account bootstrap.
  function installNavigation() {
    const menus = [...document.querySelectorAll('.army-site nav.nav details.nav-group')];
    if (!menus.length) return;
    let closeTimer = null;
    const cancelClose = () => { clearTimeout(closeTimer); closeTimer = null; };
    const close = except => { cancelClose(); for (const menu of menus) { if (menu === except) continue; menu.removeAttribute('open'); menu.querySelector('summary').setAttribute('aria-expanded', 'false'); } };
    const open = (menu, value) => { cancelClose(); if (value) close(menu); if (value) menu.setAttribute('open', ''); else menu.removeAttribute('open'); menu.querySelector('summary').setAttribute('aria-expanded', String(value)); };
    const fine = event => event.pointerType === 'mouse' && typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    for (const menu of menus) {
      const summary = menu.querySelector('summary'); let pointerInside = false;
      summary.addEventListener('click', event => { event.preventDefault(); open(menu, pointerInside && event.detail > 0 ? true : !menu.hasAttribute('open')); });
      summary.addEventListener('keydown', event => { if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return; event.preventDefault(); open(menu, true); const links = menu.querySelectorAll('.nav-menu a'); (event.key === 'ArrowUp' ? links[links.length - 1] : links[0])?.focus(); });
      menu.addEventListener('toggle', () => { if (menu.hasAttribute('open')) open(menu, true); else summary.setAttribute('aria-expanded', 'false'); });
      menu.addEventListener('pointerenter', event => { if (!fine(event)) return; pointerInside = true; open(menu, true); });
      menu.addEventListener('pointerleave', event => { if (!fine(event)) return; pointerInside = false; if (!menu.hasAttribute('open')) return; cancelClose(); closeTimer = setTimeout(() => { closeTimer = null; const focused = document.activeElement; if (!pointerInside && !(focused && focused !== summary && menu.contains(focused))) open(menu, false); }, 180); });
      menu.addEventListener('focusin', event => { cancelClose(); if (event.target !== summary) open(menu, true); });
      menu.addEventListener('focusout', event => { if (!pointerInside && event.relatedTarget && !menu.contains(event.relatedTarget)) open(menu, false); });
      menu.addEventListener('click', event => { if (event.defaultPrevented || event.button && event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !event.target.closest?.('a')) return; cancelClose(); closeTimer = setTimeout(() => { closeTimer = null; open(menu, false); }, 0); });
    }
    document.addEventListener('click', event => { if (!event.target.closest?.('.army-site nav.nav details.nav-group')) close(); });
    document.addEventListener('keydown', event => { if (event.key !== 'Escape') return; const menu = menus.find(value => value.hasAttribute('open')); if (!menu) return; event.preventDefault(); close(); menu.querySelector('summary').focus(); });
  }
  installNavigation();
  function createReader(root, status, refresh, options = {}) {
    let generation = 0, request = null, displayed = null, displayTimer = null, destroyed = false;
    const live = () => !destroyed && (!options.isCurrent || options.isCurrent());
    function endDisplay() { displayed = null; if (displayTimer !== null) clearInterval(displayTimer); displayTimer = null; }
    function ageDisplay() {
      if (!live() || !displayed || document.hidden) return;
      const elapsed = performance.now() - displayed.monotonic;
      if (!Number.isFinite(elapsed) || elapsed < 0) { clear(); return; }
      const now = displayed.now + Math.floor(elapsed / 1000), freshness = displayed.snapshots.map(snapshot => [now - snapshot.observedAt > 86400 || now - snapshot.guilds[0].receivedAt > 86400, now - snapshot.guilds[0].receivedAt > 900].join(':')).join('|');
      if (freshness === displayed.freshness) return;
      displayed.freshness = freshness; root.replaceChildren();
      for (const snapshot of displayed.snapshots) root.append(card(snapshot, now));
    }
    async function load() {
      if (!live() || document.hidden) return;
      const token = ++generation; if (request) request.abort(); const owned = new AbortController(); request = owned; refresh.disabled = true;
      endDisplay(); status.textContent = 'Reading published snapshots…'; status.className = 'notice'; root.replaceChildren();
      const timer = setTimeout(() => owned.abort(), 15000);
      try {
        const response = await fetch('/api/army', {cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: owned.signal});
        if (!response.ok || !response.body) throw Error('Published snapshots are unavailable. No old figures are being shown.');
        const reader = response.body.getReader(), chunks = []; let bytes = 0;
        try { for (;;) { const value = await reader.read(); if (value.done) break; bytes += value.value.byteLength; if (bytes > 524288) throw Error('The snapshot response exceeded its bounds.'); chunks.push(value.value); } } catch (error) { await reader.cancel().catch(() => {}); throw error; } finally { reader.releaseLock(); }
        const joined = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
        const data = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(joined));
        if (!data || Object.keys(data).sort().join('|') !== 'format|now|snapshots' || data.format !== 'olympus-army-public-v1' || !Number.isSafeInteger(data.now) || data.now < 0 || !Array.isArray(data.snapshots) || data.snapshots.length > 300 || !protocol) throw Error('The Army snapshot response was not recognized.');
        const snapshots = data.snapshots.map(snapshot => {
          if (!snapshot || !Number.isSafeInteger(snapshot.observedAt) || snapshot.observedAt > data.now) throw Error('The source time was not recognized.');
          const checked = protocol.validatePayload(new TextEncoder().encode(JSON.stringify(snapshot)), {nowSeconds: snapshot.observedAt});
          if (checked.realmGroup !== 'World of Warcraft: Forever PvE' || checked.faction !== 'Alliance' || !allowedGuild(checked.guilds[0].name)) throw Error('The publication scope was not recognized.');
          return checked;
        });
        const keys = snapshots.map(snapshot => JSON.stringify([snapshot.realmGroup, snapshot.faction, snapshot.guilds[0].name]));
        if (new Set(keys).size !== keys.length) throw Error('The Army response contained conflicting guild entries.');
        if (token !== generation || !live() || document.hidden) return;
        for (const snapshot of snapshots) root.append(card(snapshot, data.now));
        if (!snapshots.length) { const empty = node('article', undefined, 'army-card'); empty.append(node('h2', 'No published snapshots yet'), node('p', 'A qualified reporter must deliberately review and publish an aggregate before any figures appear. Missing data is not a zero.')); root.append(empty); }
        status.textContent = snapshots.length ? 'Published observations · read at ' + time(data.now) + '. Refresh deliberately for newer reports.' : 'No shared figures are available yet.';
        displayed = {snapshots, now: data.now, monotonic: performance.now(), freshness: snapshots.map(snapshot => [data.now - snapshot.observedAt > 86400 || data.now - snapshot.guilds[0].receivedAt > 86400, data.now - snapshot.guilds[0].receivedAt > 900].join(':')).join('|')};
        displayTimer = setInterval(ageDisplay, 1000);
      } catch (_) { if (token === generation && live() && !document.hidden) { root.replaceChildren(); status.textContent = 'Published snapshots could not be read. Refresh to try again; no stale or partial figures are shown.'; status.className = 'notice error'; } }
      finally { clearTimeout(timer); if (request === owned) request = null; if (token === generation && live()) refresh.disabled = false; }
    }
    function clear() { generation++; if (request) request.abort(); request = null; endDisplay(); root.replaceChildren(); refresh.disabled = false; status.textContent = 'The view was cleared. Refresh deliberately when you return.'; }
    const hidden = () => { if (document.hidden && !destroyed) clear(); };
    function destroy() {
      if (destroyed) return;
      clear(); destroyed = true; refresh.disabled = true;
      refresh.removeEventListener?.('click', load); document.removeEventListener?.('visibilitychange', hidden); window.removeEventListener?.('pagehide', clear);
    }
    refresh.addEventListener('click', load); document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', clear);
    load(); return Object.freeze({destroy});
  }
  window.OlympusArmyReader = Object.freeze({mount(container, options = {}) {
    const actions = node('div', undefined, 'actions'), refresh = node('button', 'Refresh snapshots'), status = node('p', 'Loading shared snapshots…', 'notice'), root = node('section', undefined, 'army-results');
    refresh.type = 'button'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); root.setAttribute('aria-label', 'Shared guild snapshots');
    container.classList.add('army-reader'); actions.append(refresh); container.append(actions, status, root);
    return createReader(root, status, refresh, options);
  }});
  // Standalone compatibility and isolated reporter documents keep their original static policies.
  const root = document.getElementById('army-results'), status = document.getElementById('army-status'), refresh = document.getElementById('army-refresh');
  if (root && status && refresh) createReader(root, status, refresh);
}());

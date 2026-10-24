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
  function createReader(root, status, refresh, options = {}, stamp = null) {
    let generation = 0, request = null, requestQuiet = false, displayed = null, displayTimer = null, refreshTimer = null, accessStopped = false, suspended = false, destroyed = false;
    const live = () => !destroyed && (!options.isCurrent || options.isCurrent());
    // .186: the read time is a separate non-live line, so a quiet timer read is not announced every minute.
    const readAt = text => { if (stamp) stamp.textContent = text; };
    const freshnessAt = (snapshots, now) => snapshots.map(snapshot => [now - snapshot.observedAt > 86400 || now - snapshot.guilds[0].receivedAt > 86400, now - snapshot.guilds[0].receivedAt > 900].join(':')).join('|');
    // .186: what the cards show at `now`: both age flags, and each snapshot with an online count older than 900 s withdrawn exactly
    // as card() withdraws it. Quiet reads compare this, not the raw answer, so a server that withholds an expired count is no change.
    const viewAt = (snapshots, now) => freshnessAt(snapshots, now) + '\n' + JSON.stringify(snapshots.map(snapshot => now - snapshot.guilds[0].receivedAt > 900 ? {...snapshot, guilds: snapshot.guilds.map((guild, index) => index ? guild : {...guild, online: null})} : snapshot));
    // The page's estimate of the server clock: the shown answer's time plus whole seconds since it was shown; null when the clock is unusable.
    const estimateNow = () => { const elapsed = performance.now() - displayed.monotonic; return Number.isFinite(elapsed) && elapsed >= 0 ? displayed.now + Math.floor(elapsed / 1000) : null; };
    function stopRefresh() { if (refreshTimer !== null) clearTimeout(refreshTimer); refreshTimer = null; }
    function scheduleRefresh() {
      stopRefresh();
      if (!live()) { destroy(); return; }
      if (document.hidden || suspended || accessStopped || request) return;
      refreshTimer = setTimeout(() => { refreshTimer = null; load('timer'); }, 60000);
    }
    function endDisplay() { displayed = null; if (displayTimer !== null) clearInterval(displayTimer); displayTimer = null; }
    // Open breakdowns (and a focused breakdown summary) per exact guild name, read from the cards on screen.
    function openState() {
      const state = {expanded: new Map(), focus: null, from: null}, active = document.activeElement;
      for (const article of root.children) {
        const heading = Array.from(article.children).find(child => child.tagName === 'H2');
        if (!heading) continue;
        const sections = Array.from(article.children).filter(child => child.tagName === 'DETAILS');
        state.expanded.set(heading.textContent, new Set(sections.filter(child => child.open).map(child => child.children[0].textContent)));
        const holder = active ? sections.find(child => child.children[0] === active) : undefined;
        if (holder) { state.focus = [heading.textContent, holder.children[0].textContent]; state.from = active; }
      }
      return state;
    }
    // Every card is built first and then swapped in with one replaceChildren call: the results are never blank in between.
    function paint(snapshots, now, state) {
      let focusTarget = null;
      const cards = snapshots.map(snapshot => {
        const article = card(snapshot, now), name = snapshot.guilds[0].name, opened = state.expanded.get(name);
        for (const child of article.children) if (child.tagName === 'DETAILS') {
          const title = child.children[0].textContent;
          if (opened && opened.has(title)) child.open = true;
          if (state.focus && state.focus[0] === name && state.focus[1] === title) focusTarget = child.children[0];
        }
        return article;
      });
      if (!snapshots.length) { const empty = node('article', undefined, 'army-card'); empty.append(node('h2', 'No published snapshots yet'), node('p', 'A qualified reporter must deliberately review and publish an aggregate before any figures appear. Missing data is not a zero.')); cards.push(empty); }
      root.replaceChildren(...cards);
      // Focus returns only where the swap took it away (the body, nothing, or the replaced summary itself), never from an element
      // the reader moved to while a visible read was running.
      const active = document.activeElement;
      if (focusTarget && (!active || active === document.body || active === state.from)) focusTarget.focus({preventScroll: true});
    }
    function ageDisplay() {
      if (!live()) { destroy(); return; }
      if (!displayed || document.hidden) return;
      const now = estimateNow();
      if (now === null) { clear(); return; }
      const freshness = freshnessAt(displayed.snapshots, now);
      if (freshness === displayed.freshness) return;
      displayed.freshness = freshness; displayed.view = viewAt(displayed.snapshots, now); paint(displayed.snapshots, now, openState());
    }
    // mode 'initial' (first read, return to the page) and 'user' (Refresh) clear and say so before reading.
    // mode 'timer' is quiet: cards, status, read time and Refresh stay untouched while it runs. A validated answer that shows
    // exactly what is on screen keeps every card node and only rewrites the read time; any visible change swaps all cards in one
    // step and is announced once. A failure still clears.
    async function load(mode = 'initial') {
      if (!live()) { destroy(); return; }
      if (document.hidden || suspended || accessStopped || request) return;
      stopRefresh();
      const quiet = mode === 'timer', token = ++generation, owned = new AbortController(); request = owned; requestQuiet = quiet;
      let state = null;
      if (!quiet) { state = openState(); refresh.disabled = true; endDisplay(); status.textContent = 'Reading published snapshots…'; status.className = 'notice'; readAt(''); root.replaceChildren(); }
      const timer = setTimeout(() => owned.abort(), 15000);
      try {
        const response = await fetch('/api/army', {cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: owned.signal});
        if (token !== generation || !live() || document.hidden) return;
        if (owned.signal.aborted) throw Error('The snapshot read timed out.');
        if (response.status === 401 || response.status === 403) accessStopped = true;
        if (!response.ok || !response.body) throw Error('Published snapshots are unavailable. No old figures are being shown.');
        const reader = response.body.getReader(), chunks = []; let bytes = 0;
        try { for (;;) { const value = await reader.read(); if (value.done) break; bytes += value.value.byteLength; if (bytes > 524288) throw Error('The snapshot response exceeded its bounds.'); chunks.push(value.value); } } catch (error) { await reader.cancel().catch(() => {}); throw error; } finally { reader.releaseLock(); }
        const joined = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
        const data = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(joined));
        if (!data || Object.keys(data).sort().join('|') !== 'format|now|snapshots' || data.format !== 'olympus-army-public-v1' || !Number.isSafeInteger(data.now) || data.now < 0 || !Array.isArray(data.snapshots) || data.snapshots.length > 300 || !protocol) throw Error('The Army snapshot response was not recognized.');
        const snapshots = data.snapshots.map(snapshot => {
          if (!snapshot || !Number.isSafeInteger(snapshot.observedAt) || snapshot.observedAt > data.now) throw Error('The source time was not recognized.');
          const checked = snapshot?.addonVersion === '1.3.2-site.1' ? window.OlympusSanitizedExport.validateSnapshot(snapshot, snapshot.observedAt) : protocol.validatePayload(new TextEncoder().encode(JSON.stringify(snapshot)), {nowSeconds: snapshot.observedAt});
          if (checked.realmGroup !== 'World of Warcraft: Forever PvE' || checked.faction !== 'Alliance' || !allowedGuild(checked.guilds[0].name)) throw Error('The publication scope was not recognized.');
          return checked;
        });
        const keys = snapshots.map(snapshot => JSON.stringify([snapshot.realmGroup, snapshot.faction, snapshot.guilds[0].name]));
        if (new Set(keys).size !== keys.length) throw Error('The Army response contained conflicting guild entries.');
        if (token !== generation || !live() || document.hidden) return;
        if (owned.signal.aborted) throw Error('The snapshot read timed out.');
        // A timer answer is never shown at an earlier time than the cards already show: the 1 s ticker may have passed the server's
        // `now` while the read ran, and an online count it withdrew must stay withdrawn rather than reappear for a second.
        const previous = displayed, estimate = previous ? estimateNow() : null, shownAt = estimate === null ? data.now : Math.max(data.now, estimate);
        const freshness = freshnessAt(snapshots, shownAt), view = viewAt(snapshots, shownAt), unchanged = quiet && previous !== null && previous.view === view;
        if (!unchanged) {
          paint(snapshots, shownAt, state || openState());
          status.textContent = !snapshots.length ? 'No shared figures are available yet. Checks every 60 seconds while visible.' : quiet && previous ? 'Published observations changed at ' + time(data.now) + '. Checks for newer reports every 60 seconds while visible.' : 'Published observations. Checks for newer reports every 60 seconds while visible.';
          status.className = 'notice';
        }
        endDisplay();
        readAt('Read at ' + time(data.now) + '.');
        displayed = {snapshots, now: shownAt, monotonic: performance.now(), freshness, view};
        displayTimer = setInterval(ageDisplay, 1000);
      } catch (_) {
        if (token === generation && live() && !document.hidden) {
          endDisplay(); root.replaceChildren(); readAt('');
          // A repeated identical failure (a sustained outage) leaves the polite region as it is instead of re-stating it every minute.
          const message = accessStopped ? 'Published snapshots could not be read because your access is unavailable. Sign in or confirm access, then refresh to try again. Automatic refresh is stopped.' : 'Published snapshots could not be read. No stale or partial figures are shown. Checks again in 60 seconds while visible, or refresh to try now.';
          if (status.textContent !== message) status.textContent = message;
          if (status.className !== 'notice error') status.className = 'notice error';
        }
      }
      finally { clearTimeout(timer); if (request === owned) request = null; if (token === generation && live()) { refresh.disabled = false; scheduleRefresh(); } else if (!live()) destroy(); }
    }
    function clear() { generation++; stopRefresh(); if (request) request.abort(); request = null; endDisplay(); root.replaceChildren(); readAt(''); refresh.disabled = false; if (!accessStopped) status.textContent = 'The view was cleared. A fresh read will run when you return.'; }
    // A deliberate Refresh takes over a quiet timer read that is still running, so the click always starts a visible read.
    // A visible read in flight still absorbs the click (single flight).
    function deliberateRefresh() {
      if (!live()) { destroy(); return; }
      if (document.hidden || suspended) return;
      if (request && requestQuiet) { generation++; request.abort(); request = null; }
      if (request) return;
      accessStopped = false; return load('user');
    }
    const hidden = () => { if (destroyed) return; if (!live()) { destroy(); return; } if (document.hidden) clear(); else load(); };
    const pageHidden = () => { if (!destroyed) { suspended = true; clear(); } };
    const pageShown = event => { if (!destroyed && event.persisted) { suspended = false; load(); } };
    function destroy() {
      if (destroyed) return;
      clear(); destroyed = true; refresh.disabled = true;
      refresh.removeEventListener?.('click', deliberateRefresh); document.removeEventListener?.('visibilitychange', hidden); window.removeEventListener?.('pagehide', pageHidden); window.removeEventListener?.('pageshow', pageShown);
    }
    refresh.addEventListener('click', deliberateRefresh); document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', pageHidden); window.addEventListener('pageshow', pageShown);
    load(); return Object.freeze({destroy});
  }
  window.OlympusArmyReader = Object.freeze({mount(container, options = {}) {
    const actions = node('div', undefined, 'actions'), refresh = node('button', 'Refresh snapshots'), status = node('p', 'Loading shared snapshots…', 'notice'), root = node('section', undefined, 'army-results'), stamp = node('p', '', 'muted');
    refresh.type = 'button'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); root.setAttribute('aria-label', 'Shared guild snapshots');
    container.classList.add('army-reader'); actions.append(refresh); container.append(actions, status, root, stamp);
    return createReader(root, status, refresh, options, stamp);
  }});
  // Standalone compatibility and isolated reporter documents keep their original static policies.
  const root = document.getElementById('army-results'), status = document.getElementById('army-status'), refresh = document.getElementById('army-refresh');
  if (root && status && refresh) createReader(root, status, refresh, {}, document.getElementById('army-read-time'));
}());

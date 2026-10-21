(function () {
  'use strict';
  const root = document.getElementById('army-results'), status = document.getElementById('army-status'), refresh = document.getElementById('army-refresh');
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
  if (!root || !status || !refresh) return;
  let generation = 0, request = null, displayed = null, displayTimer = null;
  function endDisplay() { displayed = null; if (displayTimer !== null) clearInterval(displayTimer); displayTimer = null; }
  function ageDisplay() {
    if (!displayed || document.hidden) return;
    const elapsed = performance.now() - displayed.monotonic;
    if (!Number.isFinite(elapsed) || elapsed < 0) { clear(); return; }
    const now = displayed.now + Math.floor(elapsed / 1000), freshness = displayed.snapshots.map(snapshot => [now - snapshot.observedAt > 86400 || now - snapshot.guilds[0].receivedAt > 86400, now - snapshot.guilds[0].receivedAt > 900].join(':')).join('|');
    if (freshness === displayed.freshness) return;
    displayed.freshness = freshness; root.replaceChildren();
    for (const snapshot of displayed.snapshots) root.append(card(snapshot, now));
  }
  async function load() {
    if (document.hidden) return;
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
      if (token !== generation || document.hidden) return;
      for (const snapshot of snapshots) root.append(card(snapshot, data.now));
      if (!snapshots.length) { const empty = node('article', undefined, 'army-card'); empty.append(node('h2', 'No published snapshots yet'), node('p', 'A qualified reporter must deliberately review and publish an aggregate before any figures appear. Missing data is not a zero.')); root.append(empty); }
      status.textContent = snapshots.length ? 'Published observations · read at ' + time(data.now) + '. Refresh deliberately for newer reports.' : 'No shared figures are available yet.';
      displayed = {snapshots, now: data.now, monotonic: performance.now(), freshness: snapshots.map(snapshot => [data.now - snapshot.observedAt > 86400 || data.now - snapshot.guilds[0].receivedAt > 86400, data.now - snapshot.guilds[0].receivedAt > 900].join(':')).join('|')};
      displayTimer = setInterval(ageDisplay, 1000);
    } catch (_) { if (token === generation && !document.hidden) { root.replaceChildren(); status.textContent = 'Published snapshots could not be read. Refresh to try again; no stale or partial figures are shown.'; status.className = 'notice error'; } }
    finally { clearTimeout(timer); if (request === owned) request = null; if (token === generation) refresh.disabled = false; }
  }
  refresh.addEventListener('click', load);
  function clear() { generation++; if (request) request.abort(); request = null; endDisplay(); root.replaceChildren(); refresh.disabled = false; status.textContent = 'The view was cleared. Refresh deliberately when you return.'; }
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); }); window.addEventListener('pagehide', clear);
  load();
}());

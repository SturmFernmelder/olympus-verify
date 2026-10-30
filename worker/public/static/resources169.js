/* Curated public-source references; the server owns current signed-in admission. */
(function () {
  "use strict";
  const CATALOG = "/static/resources169.json", UPDATES = "/api/resource-updates";
  const sourceHosts = new Set(["www.wowhead.com", "www.icy-veins.com", "www.wow-professions.com", "www.method.gg", "mobalytics.gg", "www.warcrafttavern.com", "news.blizzard.com", "us.forums.blizzard.com", "www.curseforge.com", "github.com", "community.restedxp.com", "zygorguides.com", "theforeverera.com", "classicwowforever.com", "forever-codex.com"]);
  const sourceIds = new Set(["blizzard-notes", "wowhead-forever", "wowhead-blues"]);
  const foreverTrackers = Object.freeze([
    { name: "Wowhead Forever Blue Tracker", url: "https://www.wowhead.com/forever/blue-tracker" },
    { name: "BlueTracker Forever", url: "https://www.bluetracker.gg/wow/category/187-forever/" },
  ].map(source => Object.freeze(source)));
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }
  function safeUrl(raw) {
    if (typeof raw !== "string" || raw.length > 2048) return null;
    try { const u = new URL(raw); return u.protocol === "https:" && !u.username && !u.password && !u.port && (sourceHosts.has(u.hostname) || foreverTrackers.some(source => source.url === u.href)) ? u.href : null; }
    catch (_) { return null; }
  }
  function link(label, raw) {
    const url = safeUrl(raw);
    if (!url) return el("span", label);
    const a = el("a", label); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; return a;
  }
  // Owner's full 18 October directory is plain text and fixed publisher links.
  // Keep its historical fact-check date distinct from later reconciliation.
  function checkedOwnerDirectory(value) {
    const text = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;
    const fields = (v, keys) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join() === keys.sort().join();
    const links = rows => Array.isArray(rows) && rows.length <= 12 && rows.every(row => fields(row, ["label", "url"]) && text(row.label, 200) && safeUrl(row.url));
    if (!fields(value, ["version", "title", "sourceCheckedAt", "reconciledAt", "scopeNote", "sections", "corrections"]) || value.version !== 1 || !text(value.title, 200) || value.sourceCheckedAt !== "2026-10-18" || !text(value.reconciledAt, 40) || !/^2026-10-\d{2}(?:T[^\s]{1,25})?$/.test(value.reconciledAt) || !text(value.scopeNote, 4000) || !Array.isArray(value.sections) || value.sections.length !== 5 || !Array.isArray(value.corrections) || value.corrections.length > 20) throw Error("owner directory");
    const ids = new Set();
    for (const section of value.sections) {
      if (!fields(section, ["id", "title", "intro", "blocks"]) || !text(section.id, 60) || !/^[a-z][a-z0-9-]*$/.test(section.id) || ids.has(section.id) || !text(section.title, 240) || !text(section.intro, 4000) || !Array.isArray(section.blocks) || section.blocks.length < 1 || section.blocks.length > 12) throw Error("owner directory section");
      ids.add(section.id);
      for (const block of section.blocks) if (!fields(block, ["heading", "text", "links"]) || !text(block.heading, 240) || !Array.isArray(block.text) || block.text.length < 1 || block.text.length > 12 || !block.text.every(p => text(p, 4000)) || !links(block.links)) throw Error("owner directory block");
    }
    for (const row of value.corrections) if (!fields(row, ["claim", "treatment", "links"]) || !text(row.claim, 4000) || !text(row.treatment, 4000) || !links(row.links)) throw Error("owner directory correction");
    return value;
  }
  function ownerDirectory(value) {
    const section = el("section", undefined, "resources169-owner-directory"); section.setAttribute("aria-label", value.title);
    section.append(el("h2", value.title), el("p", `Reviewed: ${value.sourceCheckedAt}. Source checks: ${value.reconciledAt.slice(0, 10)}.`, "resources169-meta"), el("p", value.scopeNote, "resources169-note"));
    const sourceLinks = rows => { const list = el("ul"); for (const row of rows) { const li = el("li"); li.append(link(row.label, row.url)); list.append(li); } return list; };
    for (const item of value.sections) {
      const part = el("section", undefined, "resources169-directory-section"); part.setAttribute("data-directory-section", item.id);
      part.append(el("h3", item.title), el("p", item.intro));
      for (const block of item.blocks) { const entry = el("div", undefined, "resources169-directory-block"); entry.append(el("h4", block.heading)); for (const paragraph of block.text) entry.append(el("p", paragraph)); if (block.links.length) entry.append(sourceLinks(block.links)); part.append(entry); }
      section.append(part);
    }
    if (value.corrections.length) {
      const corrections = el("section", undefined, "resources169-directory-corrections"); corrections.append(el("h3", "Corrections and limits"));
      for (const row of value.corrections) { const entry = el("div", undefined, "resources169-directory-block"); entry.append(el("h4", row.claim), el("p", row.treatment)); if (row.links.length) entry.append(sourceLinks(row.links)); corrections.append(entry); }
      section.append(corrections);
    }
    return section;
  }
  function time(seconds) {
    if (!Number.isSafeInteger(seconds) || seconds < 1072915200) return "not supplied";
    return new Date(seconds * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC");
  }
  function headlineRegion(source, item) {
    if (source.sourceId !== "wowhead-blues") return null;
    const safe = safeUrl(item.url); if (!safe) return null;
    const url = new URL(safe), match = url.hostname === "www.wowhead.com" && url.pathname.match(/^\/forever\/blue-tracker\/(?:news|topic)\/(us|eu)\/\d+(?:\/|$)/);
    return match ? match[1].toUpperCase() : null;
  }
  function mount(container, options) {
    const view = options && options.view;
    if (!["addons", "guides", "updates"].includes(view)) throw new Error("Unsupported resource view");
    let destroyed = false, request = null, poll = null, generation = 0, admitted = true, paused = false, updatesEpoch = 0;
    let catalog = null, updateData = null, visibleSources = null;
    const wrap = el("section", undefined, "resources169"), message = el("p", "Loading sources…", "resources169-note");
    // Catalogue filters announce their new counts without changing automatic Updates feedback.
    if (view === "addons" || view === "guides") {
      message.setAttribute("role", "status");
      message.setAttribute("aria-live", "polite");
      message.setAttribute("aria-atomic", "true");
    }
    const controls = el("div", undefined, "resources169-controls"), results = el("div", undefined, "resources169-grid");
    const heading = el("header", undefined, "resources169-heading");
    const titles = { addons: "Addons for Forever", guides: "The adventurer's library", updates: "Game updates" };
    const introductions = { addons: "Choose tools for the way you play. Check the Forever file, its date and any overlap before installing.", guides: "Class, profession and leveling references from named publishers. Scope and beta limits stay beside each source.", updates: "Follow original publisher headlines and official changes. These sources are separate from Olympus decisions." };
    heading.append(el("h2", titles[view]), el("p", introductions[view], "resources169-intro"));
    if (view === "updates") {
      const direct = el("nav", undefined, "resources169-provenance"); direct.setAttribute("aria-label", "Forever blue trackers");
      direct.append(el("h3", "Forever blue trackers"), el("p", "Open the publishers' Forever pages for their latest blue posts. These links stay available when automatic headline retrieval fails; no feed or current headline is implied.", "resources169-note"));
      const list = el("ul");
      for (const source of foreverTrackers) { const row = el("li"); row.append(link(source.name, source.url)); list.append(row); }
      direct.append(list); heading.append(direct);
    }
    wrap.append(heading, message, controls, results); container.append(wrap);
    const alive = () => !destroyed;
    function abort() { generation++; if (request) request.abort(); request = null; }
    function stopPoll() { if (poll !== null) clearInterval(poll); poll = null; }
    function refused(status) {
      admitted = false; stopPoll(); abort(); updateData = null; results.replaceChildren();
      refresh.disabled = true; automatic.disabled = true;
      if (typeof options.onRefused === "function") options.onRefused(status);
    }
    async function read(url) {
      abort(); const own = generation, controller = new AbortController(); request = controller;
      try {
        const response = await fetch(url, { credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal });
        if (!alive() || own !== generation) return null;
        if (!response.ok) {
          if ([401, 403, 404, 503].includes(response.status)) refused(response.status);
          throw new Error("unavailable");
        }
        const data = await response.json();
        return !alive() || own !== generation ? null : data;
      } finally { if (request === controller) request = null; }
    }
    function badge(text) { return el("span", text, "resources169-badge"); }
    function listCard(item) {
      const featured = view === "addons" && item.id === "olympus-guild" && item.url === "https://www.curseforge.com/wow/addons/olympus-guild";
      const card = el("article", undefined, "resources169-card" + (featured ? " resources169-featured" : ""));
      if (featured) card.append(el("p", "For Olympus players", "resources169-featured-label"));
      const title = el("h3"); title.append(link(item.name, item.url)); card.append(title);
      const labels = el("div", undefined, "resources169-labels");
      for (const text of [item.category, item.status]) if (typeof text === "string") labels.append(badge(text));
      card.append(labels, el("p", item.rationale));
      if (featured) { const action = link("Get Olympus Guild on CurseForge", item.url); action.className = "resources169-primary"; card.append(action); }
      const provenance = el("details", undefined, "resources169-provenance");
      provenance.append(el("summary", "Source and compatibility details"));
      if (typeof item.sourceKind === "string") provenance.append(el("p", `Source: ${item.sourceKind}`, "resources169-meta"));
      for (const [label, url] of [["Reviewed release", item.fileUrl], ["Addon API documentation", item.apiUrl]]) {
        if (typeof url === "string") { const row = el("p"); row.append(link(label, url)); provenance.append(row); }
      }
      if (typeof item.integrationNote === "string") provenance.append(el("p", item.integrationNote, "resources169-meta"));
      for (const [label, value] of [["Published file", item.version], ["Publisher release date", item.releasedAt], ["Advertised client", item.gameBuild], ["Guide scope", item.scope]]) {
        if (typeof value === "string") provenance.append(el("p", `${label}: ${value}`, "resources169-meta"));
      }
      if (Array.isArray(item.limitations)) {
        const ul = el("ul", undefined, "resources169-limits");
        for (const text of item.limitations) if (typeof text === "string") ul.append(el("li", text));
        card.append(ul);
      }
      card.append(provenance);
      return card;
    }
    function renderCatalog(query, category) {
      results.replaceChildren();
      const items = catalog[view].filter(item => (category === "all" || item.category === category) && `${item.name} ${item.category} ${item.rationale} ${(item.limitations || []).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
      if (view === "addons") items.sort((a, b) => Number(b.id === "olympus-guild") - Number(a.id === "olympus-guild"));
      for (const item of items) results.append(listCard(item));
      if (!items.length) results.append(el("p", "No sources match these filters."));
      message.textContent = `${items.length} of ${catalog[view].length} curated entries.`;
    }
    async function loadCatalog() {
      try {
        const data = await read(CATALOG); if (!data) return;
        if (data.version !== 1 || !Array.isArray(data[view]) || data[view].length > 100 || !data[view].every(x => x && typeof x.name === "string" && typeof x.rationale === "string" && typeof x.category === "string" && safeUrl(x.url))) throw new Error("catalog");
        const fullDirectory = view === "guides" && data.ownerDirectory !== undefined ? checkedOwnerDirectory(data.ownerDirectory) : null;
        catalog = data;
        const curated = view === "guides" ? el("section", undefined, "resources169-curated") : null;
        if (curated) {
          curated.setAttribute("aria-label", "Curated guide cards");
          curated.append(el("h2", "Curated guide cards"), message, controls, results);
          wrap.replaceChildren(heading, ...(fullDirectory ? [ownerDirectory(fullDirectory)] : []), curated);
        }
        const provenance = el("details", undefined, "resources169-provenance");
        provenance.append(el("summary", "About these sources"), el("p", `Last reviewed: ${catalog.checkedAt}. ${catalog.disclaimer}`, "resources169-note"));
        if (catalog.viewNotes && typeof catalog.viewNotes[view] === "string") provenance.append(el("p", catalog.viewNotes[view], "resources169-note"));
        (curated || heading).append(provenance);
        const searchLabel = el("label", "Search sources "), search = el("input"); search.type = "search"; search.placeholder = "Name, purpose or limitation"; searchLabel.append(search);
        const categoryLabel = el("label", "Category "), select = el("select"); categoryLabel.append(select);
        for (const value of ["all", ...new Set(data[view].map(x => x.category))]) { const option = el("option", value === "all" ? "All categories" : value); option.value = value; select.append(option); }
        select.value = "all";
        search.addEventListener("input", () => renderCatalog(search.value, select.value));
        select.addEventListener("change", () => renderCatalog(search.value, select.value));
        controls.append(searchLabel, categoryLabel);
        renderCatalog("", "all");
      } catch (error) { if (alive() && error.name !== "AbortError") message.textContent = "The source catalog could not be loaded. Try reopening this view."; }
    }
    // .210: a refresh keeps each source's open retrieval details and the exact focused control.
    const openRetrieval = new Set();
    let renderedLinks = new Map();
    function renderUpdates() {
      const active = document.activeElement;
      const focusKey = active ? [...renderedLinks].find(([, node]) => node === active)?.[0] : undefined;
      const links = new Map(), keep = (key, node) => { if (!links.has(key)) links.set(key, node); return node; };
      results.replaceChildren();
      for (const source of updateData.sources) {
        if (!visibleSources.has(source.sourceId)) continue;
        const card = el("article", undefined, "resources169-card"), heading = el("h3"); heading.append(keep(source.sourceId + "|source", link(source.publisher, source.sourceUrl)));
        card.append(heading, badge("Automatic feed: " + source.status), el("p", source.scope, "resources169-note"));
        const retrieval = el("details", undefined, "resources169-provenance");
        retrieval.open = openRetrieval.has(source.sourceId);
        retrieval.addEventListener("toggle", () => { if (retrieval.open) openRetrieval.add(source.sourceId); else openRetrieval.delete(source.sourceId); });
        retrieval.append(keep(source.sourceId + "|retrieval-summary", el("summary", "Retrieval details")), el("p", `Last successful retrieval: ${time(source.fetchedAt)}. Last retrieval attempt: ${time(source.checkedAt)}.`, "resources169-meta"));
        if (source.failure) card.append(el("p", `This source could not be refreshed automatically. ${source.status === "stale" ? "The older headlines below are marked stale." : "No automatically retrieved headlines are available."} The publisher's website may still be available; open the original source.`, "resources169-warning"));
        else if (source.status === "unavailable") card.append(el("p", "Automatic headlines are unavailable. The publisher's website may still be available; open the original source.", "resources169-warning"));
        if (source.failure) retrieval.append(el("p", `Reported failure: ${source.failure}`, "resources169-meta"));
        if (source.failure === "upstream" && Number.isInteger(source.upstreamStatus) && source.upstreamStatus >= 100 && source.upstreamStatus <= 599) retrieval.append(el("p", `Publisher response: HTTP ${source.upstreamStatus}.`, "resources169-meta"));
        if (source.omittedItems) card.append(el("p", `${source.omittedItems} source entries were omitted because required fields or dates were invalid.`, "resources169-note"));
        const ul = el("ul", undefined, "resources169-headlines");
        const groups = new Map();
        source.items.forEach((item, index) => {
          const url = safeUrl(item.url);
          const thread = source.sourceId === "blizzard-notes" && url && new URL(url).pathname.match(/^(.*\/t\/[^/]+\/\d+)\/(\d+)\/?$/);
          const key = thread ? thread[1] + "|" + item.title : String(index);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push({ item, post: thread ? thread[2] : null });
        });
        for (const entries of groups.values()) {
          const li = el("li"), first = entries[0].item;
          if (entries.length > 1) {
            li.append(keep(source.sourceId + "|" + first.url, link(first.title, first.url)), el("span", `${entries.length} posts from this development-notes thread`, "resources169-meta"));
            const posts = el("ul", undefined, "resources169-thread-posts");
            for (const { item, post } of entries) { const row = el("li"); row.append(keep(source.sourceId + "|thread-post|" + item.url, link(`Thread post ${post}`, item.url)), el("span", `Published: ${time(item.publishedAt)}`, "resources169-meta")); posts.append(row); }
            li.append(posts);
          } else {
            const region = headlineRegion(source, first);
            li.append(keep(source.sourceId + "|" + first.url, link(first.title, first.url)), el("span", `${region ? "Region: " + region + " · " : ""}${entries[0].post ? "Thread post " + entries[0].post + " · " : ""}Published: ${time(first.publishedAt)}`, "resources169-meta"));
          }
          ul.append(li);
        }
        card.append(ul, retrieval);
        if (!source.items.length && !source.failure && source.status !== "unavailable") card.append(el("p", "No matching headlines in this source's current feed window. This is not a complete archive.", "resources169-note"));
        results.append(card);
      }
      if (!results.children.length) results.append(el("p", "Choose a source above to show its headlines."));
      renderedLinks = links;
      const again = focusKey !== undefined && links.get(focusKey);
      if (again && typeof again.focus === "function") again.focus({ preventScroll: true });
    }
    function validUpdates(data) {
      return data && data.enabled === true && Array.isArray(data.sources) && data.sources.length === 3 && new Set(data.sources.map(x => x.sourceId)).size === 3 && data.sources.every(source => sourceIds.has(source.sourceId) && typeof source.publisher === "string" && typeof source.scope === "string" && safeUrl(source.sourceUrl) && ["fresh", "stale", "unavailable"].includes(source.status) && Array.isArray(source.items) && source.items.length <= 12 && source.items.every(item => typeof item.title === "string" && Array.from(item.title).length <= 240 && safeUrl(item.url) && (item.publishedAt === null || Number.isSafeInteger(item.publishedAt))));
    }
    const refresh = el("button", "Refresh sources", "resources169-refresh"); refresh.type = "button";
    const automatic = el("button", "Pause automatic updates", "resources169-refresh"); automatic.type = "button";
    async function loadUpdates() {
      if (!alive() || !admitted || paused || document.visibilityState !== "visible" || request) return;
      const own = ++updatesEpoch;
      refresh.disabled = true;
      try {
        const data = await read(UPDATES); if (!data || !alive() || paused || own !== updatesEpoch) return;
        if (!validUpdates(data)) throw new Error("shape");
        const unchanged = !!updateData && JSON.stringify(updateData) === JSON.stringify(data);
        updateData = data;
        if (visibleSources === null) {
          visibleSources = new Set(data.sources.map(source => source.sourceId));
          for (const source of data.sources) {
            const label = el("label", undefined, "resources169-source-filter"), input = el("input"); input.type = "checkbox"; input.checked = true;
            input.addEventListener("change", () => { if (!alive() || !admitted || !updateData) return; if (input.checked) visibleSources.add(source.sourceId); else visibleSources.delete(source.sourceId); renderUpdates(); });
            label.append(input, el("span", source.publisher)); controls.append(label);
          }
        }
        message.textContent = "Original publisher headlines. Publication dates belong to each post; retrieval details show when Olympus last read the source.";
        if (!unchanged) renderUpdates();
      } catch (error) {
        if (alive() && !paused && own === updatesEpoch && error.name !== "AbortError") {
          message.textContent = "Updates could not be read. Access may have changed or the service may be unavailable; no fresh source check is claimed.";
          if (updateData) { updateData = { ...updateData, sources: updateData.sources.map(source => ({ ...source, status: source.items.length ? "stale" : "unavailable" })) }; renderUpdates(); }
        }
      } finally { if (alive() && own === updatesEpoch) refresh.disabled = paused || !admitted; }
    }
    function visibility() {
      stopPoll();
      if (document.visibilityState !== "visible" || paused) { updatesEpoch++; abort(); return; }
      if (view === "updates" && admitted && alive()) { void loadUpdates(); poll = setInterval(() => { void loadUpdates(); }, 60000); }
    }
    if (view === "updates") {
      const timing = el("details", undefined, "resources169-provenance");
      timing.append(el("summary", "How updates refresh"), el("p", "Sources refresh when this page opens, on request and every 60 seconds while it is visible. Pause automatic updates to keep the current view; Resume reads the sources again. Cached source data may be reused for ten minutes. Publisher headlines are separate from guild decisions.", "resources169-note"));
      heading.append(timing);
      message.setAttribute("role", "status");
      controls.append(refresh, automatic); refresh.addEventListener("click", () => { void loadUpdates(); });
      automatic.addEventListener("click", () => {
        if (!alive() || !admitted) return;
        paused = !paused; stopPoll(); updatesEpoch++; abort();
        automatic.textContent = paused ? "Resume automatic updates" : "Pause automatic updates";
        refresh.disabled = paused;
        if (paused) message.textContent = "Automatic updates are paused. The current view will not refresh until you resume.";
        else { message.textContent = "Reading sources…"; visibility(); }
      });
      document.addEventListener("visibilitychange", visibility); visibility();
    } else void loadCatalog();
    return { destroy() { if (destroyed) return; destroyed = true; stopPoll(); updatesEpoch++; abort(); document.removeEventListener("visibilitychange", visibility); wrap.remove(); } };
  }
  window.OlympusResources = Object.freeze({ mount });
})();

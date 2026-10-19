/* Curated public-source references; the server owns all News/member admission (.169). */
(function () {
  "use strict";
  const CATALOG = "/static/resources169.json", UPDATES = "/api/resource-updates";
  const sourceHosts = new Set(["www.wowhead.com", "www.icy-veins.com", "www.wow-professions.com", "www.method.gg", "mobalytics.gg", "www.warcrafttavern.com", "news.blizzard.com", "us.forums.blizzard.com", "www.curseforge.com", "github.com", "community.restedxp.com", "zygorguides.com", "theforeverera.com", "classicwowforever.com", "forever-codex.com"]);
  const sourceIds = new Set(["blizzard-notes", "wowhead-forever", "wowhead-blues"]);
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }
  function safeUrl(raw) {
    if (typeof raw !== "string" || raw.length > 2048) return null;
    try { const u = new URL(raw); return u.protocol === "https:" && !u.username && !u.password && !u.port && sourceHosts.has(u.hostname) ? u.href : null; }
    catch (_) { return null; }
  }
  function link(label, raw) {
    const url = safeUrl(raw);
    if (!url) return el("span", label);
    const a = el("a", label); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; return a;
  }
  function time(seconds) {
    if (!Number.isSafeInteger(seconds) || seconds < 1072915200) return "not supplied";
    return new Date(seconds * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC");
  }
  function mount(container, options) {
    const view = options && options.view;
    if (!["addons", "guides", "updates"].includes(view)) throw new Error("Unsupported resource view");
    let destroyed = false, request = null, poll = null, generation = 0, admitted = true;
    let catalog = null, updateData = null, visibleSources = null;
    const wrap = el("section", undefined, "resources169"), message = el("p", "Loading sources…", "resources169-note");
    const controls = el("div", undefined, "resources169-controls"), results = el("div", undefined, "resources169-grid");
    const heading = el("header", undefined, "resources169-heading");
    const titles = { addons: "Addons for Forever", guides: "The adventurer's library", updates: "Game updates" };
    const introductions = { addons: "Choose tools for the way you play. Check the Forever file, its date and any overlap before installing.", guides: "Class, profession and leveling references from named publishers. Scope and beta limits stay beside each source.", updates: "Follow original publisher headlines and official changes. These sources are separate from Olympus decisions." };
    heading.append(el("h2", titles[view]), el("p", introductions[view], "resources169-intro"));
    wrap.append(heading, message, controls, results); container.append(wrap);
    const alive = () => !destroyed;
    function abort() { generation++; if (request) request.abort(); request = null; }
    function stopPoll() { if (poll !== null) clearInterval(poll); poll = null; }
    function refused(status) {
      admitted = false; stopPoll(); abort(); updateData = null; results.replaceChildren();
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
      const card = el("article", undefined, "resources169-card");
      card.append(el("h3")); card.children[0].append(link(item.name, item.url));
      const labels = el("div", undefined, "resources169-labels");
      for (const text of [item.category, item.status]) if (typeof text === "string") labels.append(badge(text));
      card.append(labels, el("p", item.rationale));
      const provenance = el("details", undefined, "resources169-provenance");
      provenance.append(el("summary", "Source and compatibility details"));
      if (typeof item.sourceKind === "string") provenance.append(el("p", `Source: ${item.sourceKind}`, "resources169-meta"));
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
      for (const item of items) results.append(listCard(item));
      if (!items.length) results.append(el("p", "No sources match these filters."));
      message.textContent = `${items.length} of ${catalog[view].length} curated entries.`;
    }
    async function loadCatalog() {
      try {
        const data = await read(CATALOG); if (!data) return;
        if (data.version !== 1 || !Array.isArray(data[view]) || data[view].length > 100 || !data[view].every(x => x && typeof x.name === "string" && typeof x.rationale === "string" && typeof x.category === "string" && safeUrl(x.url))) throw new Error("catalog");
        catalog = data;
        const provenance = el("details", undefined, "resources169-provenance");
        provenance.append(el("summary", "About these sources"), el("p", `Last reviewed: ${catalog.checkedAt}. ${catalog.disclaimer}`, "resources169-note"));
        if (catalog.viewNotes && typeof catalog.viewNotes[view] === "string") provenance.append(el("p", catalog.viewNotes[view], "resources169-note"));
        heading.append(provenance);
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
    function renderUpdates() {
      results.replaceChildren();
      for (const source of updateData.sources) {
        if (!visibleSources.has(source.sourceId)) continue;
        const card = el("article", undefined, "resources169-card"), heading = el("h3"); heading.append(link(source.publisher, source.sourceUrl));
        card.append(heading, badge(source.status), el("p", source.scope, "resources169-note"));
        const retrieval = el("details", undefined, "resources169-provenance");
        retrieval.append(el("summary", "Retrieval details"), el("p", `Last successful retrieval: ${time(source.fetchedAt)}. Last retrieval attempt: ${time(source.checkedAt)}.`, "resources169-meta"));
        if (source.failure) card.append(el("p", `This source could not be refreshed. ${source.status === "stale" ? "The older headlines below are marked stale." : "No current headlines are available; open the original source."}`, "resources169-warning"));
        else if (source.status === "unavailable") card.append(el("p", "This source is unavailable. No current headlines are available; open the original source.", "resources169-warning"));
        if (source.failure) retrieval.append(el("p", `Reported failure: ${source.failure}`, "resources169-meta"));
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
            li.append(link(first.title, first.url), el("span", `${entries.length} posts from this development-notes thread`, "resources169-meta"));
            const posts = el("ul", undefined, "resources169-thread-posts");
            for (const { item, post } of entries) { const row = el("li"); row.append(link(`Thread post ${post}`, item.url), el("span", `Published: ${time(item.publishedAt)}`, "resources169-meta")); posts.append(row); }
            li.append(posts);
          } else li.append(link(first.title, first.url), el("span", `${entries[0].post ? "Thread post " + entries[0].post + " · " : ""}Published: ${time(first.publishedAt)}`, "resources169-meta"));
          ul.append(li);
        }
        card.append(ul, retrieval);
        if (!source.items.length && !source.failure && source.status !== "unavailable") card.append(el("p", "No matching headlines in this source's current feed window. This is not a complete archive.", "resources169-note"));
        results.append(card);
      }
      if (!results.children.length) results.append(el("p", "Choose a source above to show its headlines."));
    }
    function validUpdates(data) {
      return data && data.enabled === true && Array.isArray(data.sources) && data.sources.length === 3 && new Set(data.sources.map(x => x.sourceId)).size === 3 && data.sources.every(source => sourceIds.has(source.sourceId) && typeof source.publisher === "string" && typeof source.scope === "string" && safeUrl(source.sourceUrl) && ["fresh", "stale", "unavailable"].includes(source.status) && Array.isArray(source.items) && source.items.length <= 12 && source.items.every(item => typeof item.title === "string" && Array.from(item.title).length <= 240 && safeUrl(item.url) && (item.publishedAt === null || Number.isSafeInteger(item.publishedAt))));
    }
    const refresh = el("button", "Refresh sources", "resources169-refresh"); refresh.type = "button";
    async function loadUpdates() {
      if (!alive() || !admitted || document.visibilityState !== "visible" || request) return;
      refresh.disabled = true;
      try {
        const data = await read(UPDATES); if (!data) return;
        if (!validUpdates(data)) throw new Error("shape");
        updateData = data;
        if (visibleSources === null) {
          visibleSources = new Set(data.sources.map(source => source.sourceId));
          for (const source of data.sources) {
            const label = el("label", undefined, "resources169-source-filter"), input = el("input"); input.type = "checkbox"; input.checked = true;
            input.addEventListener("change", () => { if (input.checked) visibleSources.add(source.sourceId); else visibleSources.delete(source.sourceId); renderUpdates(); });
            label.append(input, el("span", source.publisher)); controls.append(label);
          }
        }
        message.textContent = "Original publisher headlines. Publication dates belong to each post; retrieval details show when Olympus last read the source.";
        renderUpdates();
      } catch (error) {
        if (alive() && error.name !== "AbortError") {
          message.textContent = "Updates could not be read. Access may have changed or the service may be unavailable; no fresh source check is claimed.";
          if (updateData) { updateData = { ...updateData, sources: updateData.sources.map(source => ({ ...source, status: source.items.length ? "stale" : "unavailable" })) }; renderUpdates(); }
        }
      } finally { if (alive()) refresh.disabled = !admitted; }
    }
    function visibility() {
      stopPoll();
      if (document.visibilityState !== "visible") { abort(); return; }
      if (view === "updates" && admitted && alive()) { void loadUpdates(); poll = setInterval(() => { void loadUpdates(); }, 60000); }
    }
    if (view === "updates") {
      const timing = el("details", undefined, "resources169-provenance");
      timing.append(el("summary", "How updates refresh"), el("p", "Sources refresh when this page opens, on request and every 60 seconds while it is visible. Cached source data may be reused for ten minutes. Publisher headlines are separate from guild decisions.", "resources169-note"));
      heading.append(timing);
      controls.append(refresh); refresh.addEventListener("click", () => { void loadUpdates(); });
      document.addEventListener("visibilitychange", visibility); visibility();
    } else void loadCatalog();
    return { destroy() { if (destroyed) return; destroyed = true; stopPoll(); abort(); document.removeEventListener("visibilitychange", visibility); wrap.remove(); } };
  }
  window.OlympusResources = Object.freeze({ mount });
})();

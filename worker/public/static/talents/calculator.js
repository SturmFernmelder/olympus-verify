/* Original Olympus calculator (.170, owner's reference-layout request). Data and artwork attribution remain explicit. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OlympusTalents = api;
})(typeof window === "object" ? window : globalThis, function () {
  "use strict";
  const CLASS_IDS = ["warrior", "paladin", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid"];
  const DATA_URL = "/static/talents/data.json";
  const fail = message => ({ ok: false, error: message });
  const classOf = (data, name) => data.classes.find(c => c.id === String(name || "").toLowerCase());
  const talentsOf = cls => cls.trees.flatMap(tree => tree.talents);
  const pointsAtLevel = level => Number.isInteger(level) && level >= 10 && level <= 60 ? level - 9 : null;
  function validateData(data) {
    if (!data || data.schema !== "olympus-talents-v1" || !/^[a-f0-9]{12}$/.test(data.revision) || !Array.isArray(data.classes)
      || data.classes.length !== 9 || !data.source || data.source.license !== "CC-BY-4.0"
      || data.source.licenseURL !== "https://creativecommons.org/licenses/by/4.0/" || data.source.url !== "https://talentsforever.com/data.json"
      || !Array.isArray(data.source.clientBuilds) || data.source.clientBuilds.some(s => typeof s !== "string" || !/^[0-9.]+$/.test(s))
      || typeof data.source.fetchedAt !== "string" || typeof data.source.upstreamGenerated !== "string") return fail("Unrecognized talent snapshot.");
    const ids = new Set(); let nodes = 0, ranks = 0, trees = 0;
    for (const [index, cls] of data.classes.entries()) {
      if (cls.id !== CLASS_IDS[index] || !Array.isArray(cls.trees) || cls.trees.length !== 3) return fail("The nine classes need three trees each.");
      for (const tree of cls.trees) {
        trees++; const positions = new Set(), own = new Map();
        if (!Array.isArray(tree.talents) || !Array.isArray(tree.removedClassic)) return fail("Incomplete talent tree.");
        for (const t of tree.talents) {
          if (!t || !/^[a-z0-9-]+$/.test(t.id) || ids.has(t.id) || typeof t.name !== "string" || !t.name
            || !Number.isInteger(t.row) || t.row < 1 || t.row > 7 || !Number.isInteger(t.column) || t.column < 1 || t.column > 4
            || !Number.isInteger(t.maxRank) || t.maxRank < 1 || t.maxRank > 9 || !Array.isArray(t.descriptions)
            || t.descriptions.length !== t.maxRank || t.descriptions.some(s => typeof s !== "string" || !s)
            || !t.classic || !["same", "changed", "moved", "new"].includes(t.classic.status)) return fail("Invalid or incomplete talent.");
          const position = t.row + ":" + t.column;
          if (positions.has(position)) return fail("Duplicate talent grid position.");
          positions.add(position); ids.add(t.id); own.set(t.id, t); nodes++; ranks += t.maxRank;
        }
        for (const t of tree.talents) {
          const seen = new Set([t.id]); let node = t;
          while (node.requires) {
            const prior = own.get(node.requires);
            // The real Holy Shock/Divine Precision and Mind Flay pairs share a row.
            if (!prior || prior.row > node.row || seen.has(prior.id)) return fail("A prerequisite must resolve without cycles in the same tree.");
            seen.add(prior.id); node = prior;
          }
        }
      }
    }
    if (nodes !== 466 || ranks !== 1313 || trees !== 27) return fail("Snapshot coverage differs from its reviewed inventory.");
    return { ok: true, talents: nodes, ranks, trees, classes: data.classes.length };
  }
  function emptyBuild(data, className = "warrior", level = 60) {
    const cls = classOf(data, className);
    if (!cls || pointsAtLevel(level) === null) throw Error("Choose a supported class and a level from 10 to 60.");
    return { className: cls.id, level, ranks: talentsOf(cls).map(() => 0) };
  }
  function validateBuild(data, build) {
    const cls = build && classOf(data, build.className), budget = build && pointsAtLevel(build.level);
    if (!cls || budget === null || !Array.isArray(build.ranks)) return fail("Invalid class, level or rank vector.");
    const talents = talentsOf(cls);
    if (build.ranks.length !== talents.length || talents.some((talent, i) => !Object.hasOwn(build.ranks, i) || !Number.isInteger(build.ranks[i]) || build.ranks[i] < 0 || build.ranks[i] > talent.maxRank)) return fail("A talent rank is outside its allowed range.");
    const points = build.ranks.reduce((a, b) => a + b, 0);
    if (points > budget) return fail("This build needs more points than level " + build.level + " provides.");
    const byId = new Map(talents.map((t, i) => [t.id, build.ranks[i]])), treePoints = [];
    for (const tree of cls.trees) {
      treePoints.push(tree.talents.reduce((sum, t) => sum + byId.get(t.id), 0));
      for (const t of tree.talents) if (byId.get(t.id) > 0) {
        const lower = tree.talents.filter(p => p.row < t.row).reduce((sum, p) => sum + byId.get(p.id), 0);
        if (lower < 5 * (t.row - 1)) return fail(t.name + " needs " + 5 * (t.row - 1) + " points in earlier rows.");
        if (t.requires) {
          const prior = tree.talents.find(p => p.id === t.requires);
          if (byId.get(t.requires) !== prior.maxRank) return fail(t.name + " requires " + prior.name + " at its maximum rank.");
        }
      }
    }
    return { ok: true, points, budget, treePoints, levelNeeded: Math.max(10, points + 9) };
  }
  function allocate(data, build, talentId, delta) {
    const current = validateBuild(data, build);
    if (!current.ok) return current;
    if (![1, -1].includes(delta)) return fail("Change one point at a time.");
    const index = talentsOf(classOf(data, build.className)).findIndex(t => t.id === talentId);
    if (index < 0) return fail("Unknown talent.");
    const next = { ...build, ranks: build.ranks.slice() }; next.ranks[index] += delta;
    const checked = validateBuild(data, next);
    return checked.ok ? { ...checked, build: next } : checked;
  }
  function serializeBuild(data, build) {
    const checked = validateBuild(data, build); if (!checked.ok) throw Error(checked.error);
    return ["ot1", data.revision, build.className, build.level, build.ranks.join("")].join(".");
  }
  function parseBuild(data, code) {
    if (typeof code !== "string" || code.length > 256) return fail("Invalid build code.");
    const match = /^ot1\.([a-f0-9]{12})\.([a-z]+)\.(\d{2})\.([0-9]+)$/.exec(code);
    if (!match || match[1] !== data.revision) return fail("This build code belongs to a different or invalid talent snapshot.");
    const build = { className: match[2], level: Number(match[3]), ranks: Array.from(match[4], Number) }, checked = validateBuild(data, build);
    return checked.ok ? { ...checked, build } : checked;
  }
  function comparisonBadges(talent) {
    const c = talent.classic, badges = [];
    if (c.status === "new") badges.push("New");
    else if (c.status === "changed") badges.push("Changed");
    else if (c.status === "same") badges.push("Same");
    if (c.moved || c.status === "moved") badges.push("Moved");
    return badges;
  }
  const ART_URL = "/static/talents/art.json";
  function validateArt(data, art) {
    if (!art || art.schema !== "olympus-talents-art-v1" || art.revision !== data.revision) return fail("The talent artwork does not match this snapshot.");
    const classes = data.classes.map(cls => cls.id), trees = data.classes.flatMap(cls => cls.trees.map(tree => cls.id + "-" + tree.id));
    const talents = data.classes.flatMap(cls => talentsOf(cls).map(t => t.id));
    const map = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
      && Object.keys(value).sort().join("\n") === keys.slice().sort().join("\n")
      && Object.values(value).every(url => typeof url === "string" && /^\/static\/wow\/[A-Za-z0-9_/-]+\.(?:png|jpg|webp)$/.test(url) && !url.split("/").some(part => part === "." || part === ".."));
    if (!map(art.classIcons, classes) || !map(art.treeIcons, trees) || !map(art.treeBackgrounds, trees) || !map(art.talentIcons, talents)
      || art.classPortraits && !map(art.classPortraits, classes)) return fail("The talent artwork is incomplete or has an unrecognised path.");
    return { ok: true, classes: classes.length, trees: trees.length, talents: talents.length };
  }
  let dataPromise, artPromise, instanceSequence = 0;
  const mounted = new WeakMap();
  async function mount(container, options = {}) {
    if (!container || !container.ownerDocument || typeof container.replaceChildren !== "function") throw Error("A DOM container is required.");
    mounted.get(container)?.destroy();
    const document = container.ownerDocument, detailId = "olympus-talent-detail-" + ++instanceSequence;
    let active = true, compare = false, selected = null, message = "", build, data, art, detailLeaveTimer = null;
    let reusableArtwork = null, artworkNotice = null, view = null, analysisView = null, feedbackSequence = 0;
    // .189 optional level-60 sheet (prepared as .186 on the .185 PR head, never released): loaded only when its section opens;
    // a failure never blocks the calculator. The sheet draws no <img>, so the .187/.188 artwork queue never sees it.
    let statsView = null, statsOpen = false, statsPending = null, statsFailed = null;
    const failedArtwork = new Set(), artworkRecords = new WeakMap(), artworkQueue = [], loadingArtwork = new Set();
    let pumpingArtwork = false;
    function cancelDetailLeave() { if (detailLeaveTimer !== null) clearTimeout(detailLeaveTimer); detailLeaveTimer = null; }
    const controller = { destroy() { active = false; cancelDetailLeave(); analysisView?.destroy(); analysisView = null; statsView?.destroy(); statsView = null; statsPending = null; statsFailed = null; view = null; artworkQueue.length = 0; for (const entry of loadingArtwork) entry.node.removeAttribute("src"); loadingArtwork.clear(); failedArtwork.clear(); reusableArtwork = null; artworkNotice = null; if (mounted.get(container) === controller) mounted.delete(container); } };
    mounted.set(container, controller);
    const h = (tag, attrs, ...children) => {
      const node = document.createElement(tag);
      for (const [key, value] of Object.entries(attrs || {})) {
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
        else if (key === "disabled" || key === "checked" || key === "hidden") node[key] = value;
        else node.setAttribute(key, String(value));
      }
      for (const child of children.flat()) if (child !== null && child !== undefined) node.append(typeof child === "string" ? document.createTextNode(child) : child);
      return node;
    };
    const artworkKey = (url, attrs) => [url, attrs.class || "", attrs["aria-hidden"] || ""].join("\n"), PENDING_ARTWORK = "talents-art-pending";
    function updateArtworkNotice() {
      for (const node of failedArtwork) if (!container.contains(node)) failedArtwork.delete(node);
      if (active && artworkNotice) artworkNotice.hidden = failedArtwork.size === 0;
    }
    function pumpArtwork() {
      if (!active || pumpingArtwork) return;
      pumpingArtwork = true;
      try {
        // .187: cold class switches must not start dozens of protected requests at once.
        // Detached in-flight attempts retain their slot until load/error; dropping a
        // stale queued node never grants another slot while its older request is live.
        for (let i = artworkQueue.length - 1; i >= 0; i--) if (!container.contains(artworkQueue[i].node)) artworkQueue.splice(i, 1)[0].state = "cancelled";
        while (loadingArtwork.size < 4 && artworkQueue.length) {
          const entry = artworkQueue.shift();
          if (entry.state !== "queued" || !container.contains(entry.node)) continue;
          entry.state = "loading"; loadingArtwork.add(entry);
          entry.node.setAttribute("src", entry.url);
        }
      } finally { pumpingArtwork = false; }
    }
    function settledArtwork(entry, loaded) {
      if (!active || entry.state !== "loading") return;
      const released = loadingArtwork.delete(entry);
      entry.state = loaded ? "loaded" : "failed";
      if (container.contains(entry.node)) {
        // .188: a settled image leaves its reserved, invisible pending box; only a failure leaves the layout (as before .187).
        entry.node.className = entry.className; entry.node.hidden = !loaded;
        if (loaded) failedArtwork.delete(entry.node); else failedArtwork.add(entry.node);
      }
      updateArtworkNotice();
      if (released) pumpArtwork();
    }
    function queueArtwork(entry) {
      // .188: layout artwork (class strip, tree header icons and backdrops, portrait, tooltip icon) waits only behind earlier
      // layout artwork; deferred talent icons wait behind all of it. Each group keeps its own first-in, first-out order.
      const ahead = entry.deferred ? -1 : artworkQueue.findIndex(item => item.deferred);
      if (ahead < 0) artworkQueue.push(entry); else artworkQueue.splice(ahead, 0, entry);
    }
    function image(url, attrs = {}, deferred = false) {
      // .177: reuse only images already mounted in this active calculator. Point edits
      // must not re-request every private icon. No cross-mount cache or admission bypass.
      const prior = reusableArtwork?.get(artworkKey(url, attrs))?.shift();
      if (prior) {
        // .188: a still-queued node reused in another role (one class's tree icon is another class's talent icon) moves to that role's place.
        const record = artworkRecords.get(prior), at = record ? artworkQueue.indexOf(record) : -1;
        if (record && record.deferred !== deferred) { record.deferred = deferred; if (at >= 0 && record.state === "queued") { artworkQueue.splice(at, 1); queueArtwork(record); } }
        return prior;
      }
      // .188: a queued image keeps its CSS-sized box and is only invisible (calculator.css), so late artwork never moves the
      // layout. Deferred talent icons wait behind the class strip, tree headers and backdrops, the portrait and the tooltip icon.
      const className = attrs.class || "", node = h("img", { ...attrs, class: (className ? className + " " : "") + PENDING_ARTWORK, alt: "", draggable: "false", decoding: "async" });
      const entry = { node, url, className, deferred, state: "queued" };
      artworkRecords.set(node, entry); queueArtwork(entry);
      node.addEventListener("error", () => settledArtwork(entry, false));
      node.addEventListener("load", () => settledArtwork(entry, true));
      return node;
    }
    container.replaceChildren(h("p", { role: "status", text: "Opening the talent library…" }));
    try {
      if (!dataPromise) dataPromise = fetch(DATA_URL, { credentials: "same-origin" }).then(async response => {
        if (!response.ok) throw Error("The talent library could not be loaded.");
        const snapshot = await response.json(), checked = validateData(snapshot);
        if (!checked.ok) throw Error(checked.error); return snapshot;
      }).catch(error => { dataPromise = null; throw error; });
      data = await dataPromise;
      if (!artPromise) artPromise = fetch(ART_URL, { credentials: "same-origin" }).then(async response => {
        if (!response.ok) throw Error("The talent artwork could not be loaded.");
        return response.json();
      }).catch(error => { artPromise = null; throw error; });
      art = await artPromise;
      const checkedArt = validateArt(data, art);
      if (!checkedArt.ok) { artPromise = null; throw Error(checkedArt.error); }
      if (!active) return controller;
      build = emptyBuild(data, options.className || "warrior");
      if (options.build) {
        const incoming = parseBuild(data, options.build);
        if (incoming.ok) build = incoming.build; else message = incoming.error;
      }
      selected = talentsOf(classOf(data, build.className))[0].id;
      render();
      return controller;
    } catch (error) {
      if (active) container.replaceChildren(h("p", { role: "alert", text: error.message || "The talent library is unavailable." }));
      return controller;
    }
    function changed() {
      if (typeof options.onBuildChange === "function") options.onBuildChange({ className: build.className, build: serializeBuild(data, build), level: build.level, points: validateBuild(data, build).points });
    }
    function edit(talentId, delta) {
      if (!active) return;
      selected = talentId; const result = allocate(data, build, talentId, delta);
      if (result.ok) { build = result.build; message = ""; changed(); } else message = result.error;
      render(talentId, result.ok ? delta > 0 ? "learn" : "refund" : "blocked");
    }
    function chooseClass(className) {
      if (!active) return;
      if (className === build.className) return; // Re-selecting the active tab is not an explicit reset.
      build = emptyBuild(data, className, build.level); selected = talentsOf(classOf(data, className))[0].id; message = ""; changed(); render("class:" + className);
    }
    function render(focus, feedback) {
      cancelDetailLeave();
      if (!active) return;
      // .179: one mounted tree per class. A point, level, reset or comparison
      // change paints existing controls; it must not detach focus or a tooltip.
      if (view && view.className === build.className) { view.paint(focus, feedback); return; }
      analysisView?.destroy(); analysisView = null; statsView?.destroy(); statsView = null; statsPending = null; statsFailed = null;
      reusableArtwork = new Map();
      for (const node of container.querySelectorAll("img")) {
        const record = artworkRecords.get(node); // .188: keyed by the requested class, never the transient pending class.
        const key = artworkKey(record?.url || node.getAttribute("src"), { class: record ? record.className : node.className, "aria-hidden": node.getAttribute("aria-hidden") });
        if (!reusableArtwork.has(key)) reusableArtwork.set(key, []);
        reusableArtwork.get(key).push(node);
      }
      const cls = classOf(data, build.className), talents = talentsOf(cls);
      let state = validateBuild(data, build), byId = new Map(talents.map((t, i) => [t.id, build.ranks[i]])), detailTalent = null, detailRefs = null;
      const buttons = new Map(), classButtons = new Map(), nodeRefs = new Map(), connectionRefs = [], treePointLabels = [], specPointRefs = [], removedRefs = [];
      if (!talents.some(t => t.id === selected)) selected = talents[0].id;
      const classSelect = h("select", { id: "olympus-talent-class", "aria-label": "Character class", tabindex: "-1", onchange(event) { chooseClass(event.target.value); } }, data.classes.map(c => h("option", { value: c.id, text: c.name })));
      classSelect.value = cls.id;
      const classRow = h("nav", { class: "talents-classes", "aria-label": "Character classes" }, data.classes.map(c => {
        const button = h("button", { type: "button", class: "talents-class-button", "data-class": c.id, "aria-pressed": String(c.id === cls.id), onclick() { chooseClass(c.id); } }, image(art.classIcons[c.id]), h("span", { text: c.name }));
        classButtons.set(c.id, button); return button;
      }));
      const level = h("select", { id: "olympus-talent-level", "aria-label": "Character level", onchange(event) {
        if (!active) return;
        const next = { ...build, level: Number(event.target.value) }, checked = validateBuild(data, next);
        if (checked.ok) { build = next; message = ""; changed(); } else message = checked.error + " Refund points or reset first.";
        render("level");
      } }, Array.from({ length: 51 }, (_, i) => h("option", { value: i + 10, text: String(i + 10) })));
      level.value = String(build.level);
      const compareInput = h("input", { type: "checkbox", checked: compare, onchange(event) { if (active) { compare = event.target.checked; render("compare"); } } });
      const detail = h("aside", { id: detailId, class: "talents-detail", "aria-label": "Selected talent", tabindex: "-1", hidden: true, onkeydown(event) { if (event.key === "Escape") { event.preventDefault(); buttons.get(selected).focus(); hideDetail(); } } });
      const status = h("p", { class: "talents-feedback", role: "status", "aria-live": "polite", text: message || "Left-click adds a point; right-click or Shift-click refunds. Hover or focus a talent to read every rank." });
      artworkNotice = h("div", { class: "talents-artwork-notice", hidden: true, role: "status", "aria-live": "polite" },
        h("p", { text: "Some artwork could not be loaded. Talent names, details and point rules are still available." }),
        h("button", { type: "button", text: "Retry artwork", onclick(event) {
          if (!active || !container.contains(event.currentTarget)) return;
          // One explicit retry of failed, currently mounted images at their original URLs.
          // The Worker checks the current session and Native boundary again on every fetch.
          for (const node of failedArtwork) if (container.contains(node)) {
            const entry = artworkRecords.get(node);
            if (!entry || entry.state === "queued" || entry.state === "loading") continue;
            node.removeAttribute("src"); entry.state = "queued"; artworkQueue.push(entry);
          }
          pumpArtwork();
        } }));
      function hideDetail() {
        cancelDetailLeave(); detail.hidden = true;
        if (detail.parentNode) detail.parentNode.removeAttribute("data-detail-open");
      }
      function showDetail(t, button, open = true) {
        cancelDetailLeave();
        const rank = byId.get(t.id), c = t.classic;
        if (detailTalent?.id !== t.id) {
          const rankLabel = h("p", { class: "talents-rank" }), currentHeading = h("h4"), currentText = h("p", { class: "talents-description" });
          const nextText = h("p", { class: "talents-description" }), next = h("div", null, h("h4", { text: "Next rank" }), nextText), ranks = h("div");
          const remove = h("button", { type: "button", onclick: () => edit(t.id, -1), text: "− Unlearn" }), learn = h("button", { type: "button", onclick: () => edit(t.id, 1), text: "+ Learn" });
          const classic = h("section", { class: "talents-classic", hidden: !compare }, h("h4", { text: "Classic comparison" }), h("p", { class: "talents-badges" }, comparisonBadges(t).map(label => h("span", { class: "talents-badge " + label.toLowerCase(), text: label }))),
            c.text ? h("div", null, h("p", { class: "talents-reference-label", text: "Classic rank-one reference · " + c.tree + " · " + c.max + " ranks" }), h("p", { class: "talents-description", text: c.text })) : h("p", { text: "No direct Classic counterpart is listed in this snapshot." }),
            c.renamed ? h("p", { text: "Classic name: " + c.renamed }) : null,
            c.note ? h("p", { text: c.note }) : null,
            c.replaces?.length ? h("p", { text: "Replaces: " + c.replaces.join(", ") }) : null);
          detail.replaceChildren(...[h("div", { class: "talents-tooltip-heading" }, image(art.talentIcons[t.id]), h("h3", { text: t.name }), h("button", { type: "button", class: "talents-detail-close", "aria-label": "Close talent details", text: "Close", onclick() { hideDetail(); if (button) button.focus(); hideDetail(); } })),
            rankLabel, t.cost ? h("p", { class: "talents-cost", text: t.cost }) : null, ranks,
            t.requires ? h("p", { class: "talents-requires", text: "Requires " + talents.find(p => p.id === t.requires).name + " at maximum rank." }) : null,
            h("details", { class: "talents-all-ranks" }, h("summary", { text: "Read all " + t.maxRank + " ranks" }), h("ol", null, t.descriptions.map(text => h("li", { text })))),
            h("div", { class: "talents-detail-controls" }, remove, learn), classic].filter(node => node !== null && node !== undefined));
          detailTalent = t; detailRefs = { rankLabel, currentHeading, currentText, nextText, next, ranks, remove, learn, classic };
        }
        detailRefs.rankLabel.textContent = "Rank " + rank + " / " + t.maxRank + (t.passive ? " · Passive" : " · Active ability");
        detailRefs.currentHeading.textContent = rank ? "Current rank" : "First rank";
        detailRefs.currentText.textContent = t.descriptions[Math.max(0, rank - 1)];
        detailRefs.nextText.textContent = t.descriptions[rank] || "";
        detailRefs.ranks.replaceChildren(detailRefs.currentHeading, detailRefs.currentText, ...(rank > 0 && rank < t.maxRank ? [detailRefs.next] : []));
        const focusedControl = [detailRefs.remove, detailRefs.learn].find(control => control === document.activeElement);
        detailRefs.remove.disabled = !allocate(data, build, t.id, -1).ok; detailRefs.learn.disabled = !allocate(data, build, t.id, 1).ok; detailRefs.classic.hidden = !compare;
        if (detail.parentNode) detail.parentNode.removeAttribute("data-detail-open");
        if (button && button.parentNode) {
          if (detail.parentNode !== button.parentNode) button.parentNode.append(detail);
          if (open) button.parentNode.setAttribute("data-detail-open", "true");
        }
        for (const pick of buttons.values()) pick.removeAttribute("aria-describedby");
        if (button) button.setAttribute("aria-describedby", detailId);
        detail.hidden = !open;
        pumpArtwork();
        // .186: a focused Learn/Unlearn control that this update disabled must not strand keyboard focus. Focus moves to the open
        // detail panel (tabindex -1), where Enter does nothing, so a held or repeated Enter cannot re-learn through the talent button;
        // on a narrow screen that panel is the visible bottom sheet. A closed panel hands focus to the talent instead.
        if (focusedControl && focusedControl.disabled) (open ? detail : button)?.focus({ preventScroll: true });
      }
      const treeCards = cls.trees.map((tree, treeIndex) => {
        const treeKey = cls.id + "-" + tree.id;
        const links = tree.talents.filter(t => t.requires).map(t => {
          const parent = talents.find(p => p.id === t.requires), ready = byId.get(parent.id) === parent.maxRank;
          const baseClass = "talents-link from-r" + parent.row + " to-r" + t.row + " to-c" + t.column + " start-c" + Math.min(parent.column, t.column) + " span-r" + (t.row - parent.row) + " span-c" + Math.abs(t.column - parent.column) + (t.column < parent.column ? " leftward" : " rightward") + (t.row === parent.row ? " same-row" : "");
          const node = h("span", { class: baseClass + (ready ? " ready" : ""), "aria-hidden": "true" }, h("span", { class: "talents-link-h" }), h("span", { class: "talents-link-v" }), h("span", { class: "talents-link-arrow" }));
          connectionRefs.push({ node, baseClass, parent }); return node;
        });
        const pointLabel = h("strong", { text: String(state.treePoints[treeIndex]) + (state.treePoints[treeIndex] === 1 ? " point" : " points") });
        treePointLabels.push(pointLabel);
        const removed = tree.removedClassic.length ? h("details", { class: "talents-removed", hidden: !compare }, h("summary", { text: "Classic-only references (" + tree.removedClassic.length + ")" }), tree.removedClassic.map(t => h("div", null, h("strong", { text: t.name }), h("p", { text: t.text || "No text supplied." })))) : null;
        if (removed) removedRefs.push(removed);
        return h("section", { class: "talents-tree", "data-tree-index": treeIndex, "aria-label": tree.name },
          h("header", { class: "talents-tree-header" }, image(art.treeIcons[treeKey]), h("h3", { text: tree.name }), pointLabel),
          h("div", { class: "talents-tree-body" }, image(art.treeBackgrounds[treeKey], { class: "talents-backdrop", "aria-hidden": "true" }), h("div", { class: "talents-links", "aria-hidden": "true" }, links),
            h("div", { class: "talents-grid" }, tree.talents.map(t => {
              const rank = byId.get(t.id), canAdd = allocate(data, build, t.id, 1).ok, canRemove = allocate(data, build, t.id, -1).ok;
              const treeTabId = tree.talents.some(p => p.id === selected) ? selected : tree.talents[0].id;
              const pill = h("span", { class: "talents-rank-pill", "aria-hidden": "true", text: rank + "/" + t.maxRank });
              const pick = h("button", { type: "button", class: "talents-pick", tabindex: treeTabId === t.id ? "0" : "-1", "aria-pressed": String(selected === t.id), "aria-label": t.name + ", rank " + rank + " of " + t.maxRank + (canAdd ? ". Add one point." : ". Read talent details."),
                onclick: event => edit(t.id, event.shiftKey ? -1 : 1), oncontextmenu(event) { event.preventDefault(); edit(t.id, -1); },
                onpointerenter() { showDetail(t, pick); },
                onfocus() { selected = t.id; for (const [id, button] of buttons) { button.setAttribute("aria-pressed", String(id === t.id)); if (tree.talents.some(p => p.id === id)) button.tabIndex = id === t.id ? 0 : -1; } showDetail(t, pick); },
                onkeydown(event) {
                  if (event.key === "Escape") { event.preventDefault(); hideDetail(); return; }
                  if (event.key === "i" || event.key === "I") { event.preventDefault(); showDetail(t, pick); detail.focus(); return; }
                  if (["+", "="].includes(event.key)) { event.preventDefault(); edit(t.id, 1); return; }
                  if (["-", "_"].includes(event.key)) { event.preventDefault(); edit(t.id, -1); return; }
                  const axis = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
                  if (!axis) return; event.preventDefault();
                  const near = tree.talents.filter(p => axis[0] ? p.column === t.column && (p.row - t.row) * axis[0] > 0 : p.row === t.row && (p.column - t.column) * axis[1] > 0)
                    .sort((a, b) => Math.abs(a.row - t.row) + Math.abs(a.column - t.column) - Math.abs(b.row - t.row) - Math.abs(b.column - t.column))[0];
                  if (near) buttons.get(near.id).focus();
                }
              }, image(art.talentIcons[t.id], {}, true), h("span", { class: "talents-name", text: t.name }), pill);
              buttons.set(t.id, pick);
              const badges = h("span", { class: "talents-node-badges", "aria-hidden": "true", hidden: !compare, text: comparisonBadges(t).map(label => label[0]).join("") });
              const node = h("div", { class: "talents-node" + (rank ? " invested" : "") + (rank === t.maxRank ? " complete" : "") + (canAdd ? " available" : "") + (!canAdd && !rank ? " locked" : "") + (compare ? " compare-" + t.classic.status : ""), "data-row": t.row, "data-column": t.column,
                onpointerenter() { cancelDetailLeave(); },
                onpointerleave(event) {
                  if (detail.hidden || detail.parentNode !== node || node.contains(event.relatedTarget) || node.contains(document.activeElement)) return;
                  // Audit follow-up (2026-10-19): allow the pointer to cross the 9px gap into the reparented detail controls.
                  cancelDetailLeave();
                  detailLeaveTimer = setTimeout(() => {
                    detailLeaveTimer = null;
                    if (detail.parentNode === node && !node.contains(document.activeElement)) hideDetail();
                  }, 250);
                } }, pick,
                badges);
              nodeRefs.set(t.id, { node, pick, pill, badges, tree });
              return node;
            }))),
          removed);
      });
      const code = serializeBuild(data, build);
      const copy = h("button", { type: "button", text: "Copy link", async onclick() {
        const currentCode = serializeBuild(data, build), link = typeof location === "object" ? location.origin + location.pathname + "#/talents/" + cls.id + "/" + currentCode : currentCode;
        try { if (!navigator.clipboard?.writeText) throw Error("clipboard unavailable"); await navigator.clipboard.writeText(link); status.textContent = "Build link copied. Recipients must sign in and meet the site's access requirements."; }
        catch { status.textContent = "Copy the build code below; clipboard access is unavailable."; share.focus(); share.select(); }
      } });
      const reset = h("button", { type: "button", text: "Reset", onclick() { if (!active) return; build = emptyBuild(data, cls.id, build.level); message = "Build reset."; changed(); render("reset"); } });
      const share = h("input", { class: "talents-share-code", readonly: "readonly", "aria-label": "Shareable talent build code", value: code });
      const split = h("strong", { text: state.treePoints.join(" / ") }), pointsLeft = h("span", { text: "Points left: " + (state.budget - state.points) }), levelNeeded = h("span", { text: "Level needed: " + state.levelNeeded });
      const legend = h("p", { class: "talents-comparison-legend", hidden: !compare, text: "N New · C Changed · M Moved · dimmed: same as Classic. Hover or focus a talent for its Classic reference." });
      const analysisHost = options.analysis && typeof options.analysis.mount === "function" ? h("div", { class: "talents-analysis-host" }) : null;
      const guides = options.guideBuilds, checkedGuides = guides?.revision === data.revision && Array.isArray(guides.records) && Array.isArray(guides.sources);
      const guideSource = checkedGuides ? guides.sources.find(source => source.className === cls.id && typeof source.author === "string" && source.author && typeof source.updatedAt === "string" && source.updatedAt && /^https:\/\/www\.method\.gg\/wow-forever\/[a-z0-9-]+$/.test(source.url)) : null;
      const guideRecords = guideSource ? guides.records.filter(record => record.className === cls.id && typeof record.id === "string" && /^[a-z0-9-]+$/.test(record.id) && typeof record.label === "string" && record.label && record.url === guideSource.url && (() => { const candidate = parseBuild(data, record.code); return candidate.ok && candidate.build.className === cls.id; })()) : [];
      const guideStatus = h("p", { class: "talents-guide-status", role: "status", "aria-live": "polite", text: guideRecords.length ? "Choose a checked allocation to see its point budget, then load it when ready." : "No checked compatible allocation in this snapshot. Read the publisher's guide for its current recommendations." });
      const guideSelect = h("select", { "aria-label": "Guide-recommended build", onchange() {
        if (!active || view?.className !== cls.id || build.className !== cls.id || !container.contains(guideSelect)) return;
        const record = guideRecords.find(item => item.id === guideSelect.value);
        guideLoad.disabled = !record;
        if (!record) { guideStatus.textContent = "Choose a checked allocation to see its point budget, then load it when ready."; return; }
        const candidate = parseBuild(data, record.code);
        if (!candidate.ok) { guideLoad.disabled = true; guideStatus.textContent = "That allocation does not match this talent snapshot. Your plan was not changed."; return; }
        guideStatus.textContent = "Minimum level " + candidate.levelNeeded + " without Legacy bonuses. Load replaces your current plan and sets its level to " + candidate.build.level + ".";
      } }, h("option", { value: "", text: "Choose a guide build" }), guideRecords.map(record => h("option", { value: record.id, text: record.label })));
      const guideLoad = h("button", { type: "button", disabled: true, text: "Load guide build", onclick() {
        if (!active || view?.className !== cls.id || build.className !== cls.id || !container.contains(guideLoad)) return;
        const record = guideRecords.find(item => item.id === guideSelect.value), candidate = record && parseBuild(data, record.code);
        if (!candidate?.ok || candidate.build.className !== cls.id) { guideStatus.textContent = "That allocation does not match this talent snapshot. Your plan was not changed."; return; }
        build = candidate.build; selected = talents.find((talent, index) => build.ranks[index] > 0)?.id || talents[0].id;
        message = "Loaded " + record.label + ". This changes only the local calculator plan."; changed(); render("guide");
      } });
      // .186: an optional module that failed to load is named instead of silently missing; the next visit to the calculator retries it.
      const lost = Array.isArray(options.unavailable) ? options.unavailable : [], lostGuides = lost.includes("guideBuilds") && !guides, lostAnalysis = lost.includes("analysis") && !analysisHost;
      const moduleNote = lostGuides || lostAnalysis ? h("p", { class: "talents-module-note muted", text: (lostGuides ? "Guide builds" + (lostAnalysis ? " and build comparison" : "") : "Build comparison") + " could not be loaded. Reopen the calculator to try again." }) : null;
      // .189 (prepared as .186): the level-60 sheet section. app.js hands over a settled lazy loader; a module that is missing after it
      // settles is named unavailable inside this section, and closing and reopening the section asks for it again.
      const statsSource = options.stats60 && typeof options.stats60.mount === "function" ? () => options.stats60 : typeof options.loadStats60 === "function" ? options.loadStats60 : null;
      const statsBody = statsSource ? h("div", { class: "talents-stats60-body" }) : null;
      const statsHost = statsSource ? h("details", { class: "talents-stats60-host", ontoggle() { statsOpen = statsHost.open === true; if (statsOpen) openStats(); } },
        h("summary", null, h("span", { class: "talents-stats60-title", text: "Level-60 character sheet" }), h("span", { class: "talents-stats60-hint", text: "Classic-reference base stats with exact talent modifiers, charts and spec comparison" })), statsBody) : null;
      function openStats() {
        if (!active || !statsHost || statsPending === statsHost || view?.className !== cls.id || !container.contains(statsHost)) return;
        // A sheet whose data never loaded is replaced on reopening, so "close and reopen" really retries.
        if (statsView && statsFailed === statsView) { statsView.destroy(); statsView = null; statsFailed = null; }
        // Collapsed sheets are not repainted on point edits; opening brings the existing one up to date.
        if (statsView) { try { statsView.update(build); } catch { /* the sheet reports inside its own section */ } return; }
        statsPending = statsHost; statsBody.replaceChildren(h("p", { role: "status", text: "Opening the level-60 sheet…" }));
        const host = statsHost, guidesFor = guideRecords.map(record => ({ id: record.id, label: record.label, build: parseBuild(data, record.code).build }));
        Promise.resolve().then(statsSource).then(module => {
          if (!active || statsPending !== host || view?.className !== cls.id || !container.contains(host)) return;
          if (!module || typeof module.mount !== "function") throw Error("unavailable");
          statsBody.replaceChildren(); const mounted = module.mount(statsBody, { data, build, guides: guidesFor }) || null; statsView = mounted; statsPending = null;
          if (mounted && mounted.ready && typeof mounted.ready.then === "function") mounted.ready.then(ok => { if (ok === false && statsView === mounted) statsFailed = mounted; }, () => { if (statsView === mounted) statsFailed = mounted; });
        }).catch(() => {
          if (statsPending === host) statsPending = null;
          if (active && container.contains(host)) statsBody.replaceChildren(h("p", { role: "alert", text: "The level-60 sheet could not be loaded. The talent calculator still works; close and reopen this section to try again." }));
        });
      }
      const guidePanel = guideSource ? h("section", { class: "talents-guides", "aria-label": "Guide-recommended builds" },
        h("div", { class: "talents-guide-heading" }, h("h3", { text: "Guide builds" }), h("a", { href: guideSource.url, rel: "noopener noreferrer", text: "Read Method's " + cls.name + " guide" })),
        guideRecords.length ? h("div", { class: "talents-guide-controls" }, h("label", null, "Checked allocation", guideSelect), guideLoad) : null,
        guideStatus, h("details", { class: "talents-guide-about" }, h("summary", { text: "About these guide builds" }),
          h("p", { class: "talents-guide-attribution", text: "By " + guideSource.author + " · Updated " + guideSource.updatedAt + ". Beta recommendations, not a guarantee of current tuning or optimal results." }),
          h("p", { class: "talents-guide-limit", text: "Only allocations that pass this snapshot's point, tier and prerequisite rules are offered. Legacy bonus points and the publisher's leveling order are not applied here. Nothing is learned on a game character." }))) : null;
      const shell = h("section", { class: "talents-tool", "data-class": cls.id }, classRow,
        h("div", { class: "talents-toolbar" }, h("label", { class: "talents-class-select", "aria-hidden": "true" }, "Class", classSelect), h("label", null, "Level", level), reset, copy, h("label", { class: "talents-compare-switch" }, compareInput, "Compare to Classic")),
        h("header", { class: "talents-class-banner" }, image((art.classPortraits || art.classIcons)[cls.id], { class: "talents-portrait" }), h("div", { class: "talents-class-title" }, h("p", { class: "talents-eyebrow", text: "Olympus · Forever talents" }), h("h2", { text: cls.name })),
          h("div", { class: "talents-spec-bars" }, cls.trees.map((tree, index) => {
            const meter = h("meter", { min: "0", max: String(state.budget), value: String(state.treePoints[index]), "aria-label": tree.name + " points" }, String(state.treePoints[index])), label = h("b", { text: String(state.treePoints[index]) });
            specPointRefs.push({ meter, label }); return h("div", null, h("span", { text: tree.name }), meter, label);
          }))),
        guidePanel, moduleNote, h("div", { class: "talents-summary" }, split, pointsLeft, levelNeeded), legend,
        artworkNotice, h("div", { class: "talents-workspace" }, h("div", { class: "talents-trees" }, treeCards)), status,
        analysisHost, statsHost,
        h("section", { class: "talents-sharing", "aria-label": "Share this build" }, h("label", null, "Share", share)),
        h("footer", { class: "talents-source" }, h("p", null, "Talent data: ", h("a", { href: "https://talentsforever.com/", rel: "noopener noreferrer", text: "Talents Forever" }), " · ", h("a", { href: data.source.licenseURL, rel: "noopener noreferrer", text: "CC BY 4.0" }), ". World of Warcraft artwork © Blizzard Entertainment. Unofficial guild tool; not affiliated with Blizzard."),
          h("p", { text: "Beta client " + data.source.clientBuilds.join(", ") + " · Source generated " + data.source.upstreamGenerated + " · Snapshot fetched " + data.source.fetchedAt.slice(0, 10) + ". Not live tuning. The data itself is not a guide recommendation; guide allocations keep their own author and date." }),
          h("p", { text: "Standard level-10-to-60 points; Legacy Talented bonuses are not modeled. Classic comparison uses supplied rank-one references, not a full Classic calculator or a verified Classic build. Game names, text and artwork belong to Blizzard Entertainment." }),
          h("p", { class: "talents-keyboard", text: "Keyboard: Tab enters each tree; arrows move across its grid. Enter or + adds; − removes. I enters the full detail panel; Escape closes it. A refund cannot break a tier or prerequisite." })));
      function paint(nextFocus, feedbackKind) {
        if (!active || view?.className !== cls.id) return;
        state = validateBuild(data, build); byId = new Map(talents.map((t, i) => [t.id, build.ranks[i]]));
        level.value = String(build.level); compareInput.checked = compare; legend.hidden = !compare;
        split.textContent = state.treePoints.join(" / "); pointsLeft.textContent = "Points left: " + (state.budget - state.points); levelNeeded.textContent = "Level needed: " + state.levelNeeded;
        for (const [index, label] of treePointLabels.entries()) {
          const points = state.treePoints[index], spec = specPointRefs[index]; label.textContent = points + (points === 1 ? " point" : " points");
          spec.meter.setAttribute("max", String(state.budget)); spec.meter.setAttribute("value", String(points)); spec.meter.textContent = String(points); spec.label.textContent = String(points);
        }
        for (const t of talents) {
          const { node, pick, pill, badges, tree } = nodeRefs.get(t.id), rank = byId.get(t.id), canAdd = allocate(data, build, t.id, 1).ok;
          node.className = "talents-node" + (rank ? " invested" : "") + (rank === t.maxRank ? " complete" : "") + (canAdd ? " available" : "") + (!canAdd && !rank ? " locked" : "") + (compare ? " compare-" + t.classic.status : "");
          pill.textContent = rank + "/" + t.maxRank; badges.hidden = !compare;
          pick.setAttribute("aria-label", t.name + ", rank " + rank + " of " + t.maxRank + (canAdd ? ". Add one point." : ". Read talent details."));
          pick.setAttribute("aria-pressed", String(selected === t.id));
          pick.tabIndex = (tree.talents.some(p => p.id === selected) ? selected : tree.talents[0].id) === t.id ? 0 : -1;
        }
        for (const connection of connectionRefs) connection.node.className = connection.baseClass + (byId.get(connection.parent.id) === connection.parent.maxRank ? " ready" : "");
        for (const removed of removedRefs) removed.hidden = !compare;
        const currentCode = serializeBuild(data, build); share.value = currentCode; share.setAttribute("value", currentCode);
        status.textContent = message || "Left-click adds a point; right-click or Shift-click refunds. Hover or focus a talent to read every rank.";
        if (buttons.has(nextFocus)) {
          const target = buttons.get(nextFocus), insideDetails = detail.contains(document.activeElement) && detailTalent?.id === nextFocus;
          showDetail(talents.find(t => t.id === nextFocus), target, true);
          if (!insideDetails && document.activeElement !== target) target.focus({ preventScroll: true });
          if (feedbackKind) nodeRefs.get(nextFocus).node.setAttribute("data-feedback", feedbackKind + (++feedbackSequence % 2 ? "-a" : "-b"));
        } else {
          if (detailTalent) showDetail(detailTalent, buttons.get(detailTalent.id), !detail.hidden);
          if (nextFocus === "level" && document.activeElement !== level) level.focus();
          else if (nextFocus === "compare" && document.activeElement !== compareInput) compareInput.focus();
          else if (nextFocus === "reset" && document.activeElement !== reset) reset.focus();
          else if (nextFocus === "guide" && document.activeElement !== guideLoad) guideLoad.focus();
        }
        analysisView?.update(build);
        if (statsOpen) { try { statsView?.update(build); } catch { /* an optional sheet failure must not stop the calculator's paint */ } }
        updateArtworkNotice();
      }
      view = { className: cls.id, paint };
      container.replaceChildren(shell); showDetail(talents.find(t => t.id === selected), buttons.get(selected), false);
      if (analysisHost) analysisView = options.analysis.mount(analysisHost, { data, build });
      if (statsHost && statsOpen) { statsHost.open = true; openStats(); }
      paint(focus, feedback);
      if (focus && focus.startsWith("class:")) classButtons.get(cls.id).focus();
      reusableArtwork = null; updateArtworkNotice();
    }
  }
  return { validateData, validateArt, pointsAtLevel, emptyBuild, validateBuild, allocate, serializeBuild, parseBuild, comparisonBadges, mount };
});

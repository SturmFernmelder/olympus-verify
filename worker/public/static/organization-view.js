/* Public organization view. Static offices never confer identity, membership or permissions. */
const NS = "http://www.w3.org/2000/svg";
function svg(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}
export function renderOrganization(main, data, ui) {
  const { h, add, clear, posIcon, parts } = ui;
  clear(main);
  if (!document.getElementById("organization-view-style")) {
    const link = document.createElement("link"); link.id = "organization-view-style";
    link.rel = "stylesheet"; link.href = "/static/organization-view.css"; document.head.append(link);
  }
  const byId = new Map(data.nodes.map(n => [n.id, n])), buttons = new Map(), rows = new Map();
  const position = new Map(), visible = data.nodes.filter(n => n.relation !== "classification");
  const children = id => visible.filter(n => n.parent === id);
  const levels = [];
  function collect(node, depth) {
    (levels[depth] ||= []).push(node);
    children(node.id).forEach(n => collect(n, depth + 1));
  }
  visible.filter(n => n.parent === null).forEach(n => collect(n, 0));
  // .176: wrap each level in family order instead of reserving a horizontal column for every leaf.
  // Parentage, directed links and the complete reading order remain the unchanged charter model.
  function cardHeight() { return Math.max(124, ...[...buttons.values()].map(button => button.offsetHeight || 124)); }
  function compactLayout(availableWidth) {
    const columns = Math.max(1, Math.min(4, Math.floor((availableWidth - 32) / (250 * .85))));
    const width = columns * 250, pitch = cardHeight() + 30; let y = 30;
    position.clear();
    for (const level of levels) {
      level.forEach((node, i) => {
        const row = Math.floor(i / columns), rowCount = Math.min(columns, level.length - row * columns);
        position.set(node.id, { x: (Math.floor((columns - rowCount) / 2) + i % columns) * 250 + 125, y: y + row * pitch });
      });
      y += Math.ceil(level.length / columns) * pitch + 30;
    }
    return { width, height: y };
  }
  const { width, height } = compactLayout(850);
  const fullPosition = new Map(position);
  const stage = h("div", { class: "org-stage" }), viewport = h("div", { class: "org-viewport", tabindex: "0", role: "region", "aria-label": "Directed organization chart. Arrow keys pan; plus and minus zoom; Home fits the selected branch. Full map shows every chart office." }, stage);
  stage.style.width = width + "px"; stage.style.height = height + "px";
  const wires = svg("svg", { width, height, viewBox: `0 0 ${width} ${height}`, "aria-hidden": "true", class: "org-wires" });
  const defs = svg("defs");
  for (const kind of ["accountability", "coordination", "independence"]) {
    const marker = svg("marker", { id: "org-arrow-" + kind, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" });
    marker.append(svg("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "org-arrow-" + kind })); defs.append(marker);
  }
  wires.append(defs); stage.append(wires);
  const edges = [];
  function edge(fromId, toId, kind, relation) {
    const a = position.get(fromId), b = position.get(toId); if (!a || !b) return;
    const path = svg("path", { class: "org-edge org-edge-" + kind, "marker-end": `url(#org-arrow-${kind})` });
    if (kind === "coordination") path.setAttribute("marker-start", "url(#org-arrow-coordination)");
    const title = svg("title"); title.textContent = `${byId.get(fromId).title} → ${byId.get(toId).title}: ${relation}`; path.append(title); wires.append(path); edges.push({ fromId, toId, path });
  }
  for (const node of visible) {
    if (node.parent) edge(node.id, node.parent, node.relation, data.legend[node.relation]);
    for (const peer of node.coordinates) if (peer !== node.parent) edge(node.id, peer, "coordination", "liaison; no command authority");
  }
  const detail = h("section", { class: "org-inspector", "aria-label": "Office mandate", "aria-live": "polite", tabindex: "-1" });
  const detailSummary = h("summary", { text: "Office details" });
  const detailDrawer = h("details", { class: "org-detail-drawer" }, detailSummary, detail);
  detailDrawer.open = true;
  const status = h("p", { class: "small muted", role: "status", "aria-live": "polite" });
  const chartHelp = h("details", { class: "org-chart-help" }, h("summary", { text: "Chart guide and status" }), status,
    h("p", { class: "small muted", text: "Drag to pan. Use +/− or Ctrl/⌘ + wheel to zoom. Focus the chart and use arrow keys to pan, Shift for larger steps, and Home or 0 to fit the selected branch. Escape closes full screen. List includes every office and group." }));
  chartHelp.open = true;
  const search = h("input", { type: "search", id: "organization-search", maxlength: "160", placeholder: "Find an office, rank or duty…", "aria-label": "Search all offices and " + data.terms.length + " labels" });
  let scale = 1, x = 0, y = 0, selected = "council", dragging = null, isList = false, suppressClick = false, branchMode = false, disposed = false, relationshipMap205 = null;
  const zoomStatus = h("output", { class: "org-zoom", "aria-label": "Chart zoom" });
  function chartSummary() { return branchMode ? `Branch: ${byId.get(selected).title}. Parent and directly connected offices shown at a readable scale; drag to see the rest. Full map shows all ${visible.length} chart offices; List includes all ${data.nodes.length} groups.` : `Full map overview: all ${visible.length} chart offices. At overview scale, select an office and choose Fit branch to read it, or use List.`; }
  function drawLayout(shown, chartWidth, chartHeight) {
    stage.style.width = chartWidth + "px"; stage.style.height = chartHeight + "px";
    wires.setAttribute("width", chartWidth); wires.setAttribute("height", chartHeight); wires.setAttribute("viewBox", `0 0 ${chartWidth} ${chartHeight}`);
    for (const [id, button] of buttons) {
      button.hidden = !shown.has(id); const p = position.get(id);
      if (p) { button.style.left = (p.x - 115) + "px"; button.style.top = p.y + "px"; }
    }
    for (const e of edges) {
      const show = shown.has(e.fromId) && shown.has(e.toId); e.path.style.display = show ? "" : "none";
      if (!show) continue;
      const a = position.get(e.fromId), b = position.get(e.toId);
      // Wrapped rows use the empty gutters, so a distant relationship never cuts through another office's label.
      if (a.y === b.y) e.path.setAttribute("d", `M ${a.x} ${a.y} L ${a.x} ${a.y - 15} L ${b.x} ${b.y - 15} L ${b.x} ${b.y}`);
      else {
        const downward = a.y < b.y, low = downward ? b : a, high = downward ? a : b;
        const gutter = low.x + (low.x <= high.x ? 125 : -125), height = cardHeight();
        const start = a.y + (downward ? buttons.get(e.fromId).offsetHeight || 124 : 0), end = b.y + (downward ? 0 : buttons.get(e.toId).offsetHeight || 124);
        const startLane = a.y + (downward ? height + 15 : -15), endLane = b.y + (downward ? -15 : height + 15);
        e.path.setAttribute("d", `M ${a.x} ${start} L ${a.x} ${startLane} L ${gutter} ${startLane} L ${gutter} ${endLane} L ${b.x} ${endLane} L ${b.x} ${end}`);
      }
    }
  }
  function branchLayout() {
    const n = byId.get(selected); if (!n || !fullPosition.has(selected)) return null;
    const parent = n.parent && fullPosition.has(n.parent) ? byId.get(n.parent) : null;
    const related = visible.filter(o => o.id !== selected && o.id !== parent?.id && (o.parent === selected || n.coordinates.includes(o.id) || o.coordinates.includes(selected)));
    // Only presentation changes: relationship direction, kind and mandate text still come from the unchanged model.
    const columns = Math.max(1, Math.min(3, Math.max(1, related.length), Math.floor(((viewport.clientWidth || 850) - 32) / (250 * .85))));
    const chartWidth = columns * 250, pitch = cardHeight() + 30;
    position.clear(); if (parent) position.set(parent.id, { x: chartWidth / 2, y: 30 });
    const selectedY = parent ? 30 + pitch : 30; position.set(selected, { x: chartWidth / 2, y: selectedY });
    related.forEach((o, i) => {
      const row = Math.floor(i / columns), rowCount = Math.min(columns, related.length - row * columns);
      position.set(o.id, { x: (Math.floor((columns - rowCount) / 2) + i % columns) * 250 + 125, y: selectedY + pitch + row * pitch });
    });
    const chartHeight = selectedY + (related.length ? Math.ceil(related.length / columns) * pitch : 0) + cardHeight() + 16;
    drawLayout(new Set(position.keys()), chartWidth, chartHeight); return { width: chartWidth, height: chartHeight };
  }
  function transform() { stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`; zoomStatus.textContent = Math.round(scale * 100) + "%"; }
  function zoom(next, cx = viewport.clientWidth / 2, cy = viewport.clientHeight / 2) {
    next = Math.max(.05, Math.min(2, next)); x = cx - (cx - x) * next / scale; y = cy - (cy - y) * next / scale; scale = next; transform();
  }
  function fit() {
    const size = branchLayout(); if (!size) { overview(); status.textContent = "Rank and membership groupings have no command arrows. Their full descriptions are available in List. " + chartSummary(); return; }
    branchMode = true; const w = viewport.clientWidth || 850, ht = viewport.clientHeight || 620;
    // A large branch can pan instead of reducing office labels to unreadable thumbnails.
    scale = Math.max(.85, Math.min(1, (w - 32) / size.width, (ht - 32) / size.height)); x = (w - size.width * scale) / 2; y = 16;
    overviewButton.setAttribute("aria-pressed", "false"); branchButton.setAttribute("aria-pressed", "true"); status.textContent = chartSummary(); transform();
  }
  function overview() {
    branchMode = false; const w = viewport.clientWidth || 850, ht = viewport.clientHeight || 620;
    const size = compactLayout(w); drawLayout(new Set(position.keys()), size.width, size.height);
    scale = Math.max(.05, Math.min(1, (w - 32) / size.width, (ht - 32) / size.height)); x = (w - size.width * scale) / 2; y = (ht - size.height * scale) / 2;
    overviewButton.setAttribute("aria-pressed", "true"); branchButton.setAttribute("aria-pressed", "false"); status.textContent = chartSummary(); transform();
  }
  function focusNode(id) { if (branchMode) branchLayout(); const p = position.get(id); if (!p) return; scale = Math.max(.85, scale); x = viewport.clientWidth / 2 - p.x * scale; y = Math.max(50, viewport.clientHeight / 3) - p.y * scale; transform(); }
  const termPlacement = term => Number.isInteger(term.nativeSlot)
    ? `Rank ${term.nativeRankOrdinal} ${term.nativeRankName} · zero-based slot ${term.nativeSlot}. Display association; no rank or permission is applied.`
    : "No native rank placement or promotion follows from this title or status.";
  const reservedTerm201 = term => term.reservedSeat201 || ["leader", "high_council", "officer_corps"].includes(term.tier);
  const seatLink = term => {
    const family = ui.roleDirectory203?.families?.find(row => row.key === ui.roleDirectory203.keyToFamily[term.officeKey]);
    const app = family?.application;
    if (reservedTerm201(term) || !app || ui.officeAvailability?.[family.primaryKey] === false) return null;
    return h("a", { class: "btn small org-seat-apply", href: "#/vote/" + app.applicationTrack + "/" + encodeURIComponent(app.targetOffice || "new"), "data-office-application": family.primaryKey, "data-application-track": app.applicationTrack, text: "Review ordinary role application" });
  };
  const officeBadges = term => h("p", { class: "org-office-badges" }, h("span", { class: "org-tier-badge org-tier-" + term.tier, text: term.tierLabel }), h("span", { class: "small", text: "Rank " + term.nativeRankOrdinal + " · " + term.nativeRankName }), h("span", { class: "small", text: term.codexTitles.map(title => "Title " + title).join(" · ") }));
  function select(id, move = false, focus = false, term = null) {
    const n = byId.get(id); if (!n) return; selected = id; detailSummary.textContent = "Office details · " + n.title;
    if ((move || focus) && relationshipMap205) relationshipMap205.open = true;
    for (const [key, button] of buttons) button.setAttribute("aria-pressed", String(key === id));
    for (const e of edges) e.path.classList.toggle("org-edge-active", e.fromId === id || e.toId === id);
    const offices = (data.officeMandates || []).filter(o => o.nodeId === id);
    clear(detail); add(detail, [h("p", { class: "eyebrow", text: n.kind }), h("h2", { text: n.title }), term ? h("p", { text: term.label + ": " + term.note }) : null,
      term ? h("p", { class: "small", "data-native-placement": String(term.ordinal), text: termPlacement(term) }) : null,
      term?.nativeMappingNote ? h("p", { class: "small muted", text: term.nativeMappingNote }) : null,
      term ? officeBadges(term) : null,
      term ? seatLink(term) : null,
      h("h3", { text: "Purpose" }), h("p", { text: n.remit }), h("h3", { text: "Authority and boundaries" }), h("p", { text: n.limits }),
      h("p", { class: "org-relation", text: n.parent ? `${n.relation === "accountability" ? "Accountable to" : n.relation === "independence" ? "Independent review remit connected to" : "Coordinates through"}: ${byId.get(n.parent).title}.` : "Constitutional root; no reporting parent in this model." }),
      offices.length ? h("div", null, h("h3", { text: "Offices and working mandates" }), offices.map(o => h("article", { class: "org-mandate" }, h("h4", { text: o.title }), h("p", { text: o.duty }), h("p", { class: "small", text: "Record of work: " + o.output }), h("p", { class: "small muted", text: "Appointment and limits: " + o.boundary })))) : null,
      n.coordinates.length ? h("div", null, h("h3", { text: "Working relationships" }), n.coordinates.map(key => h("button", { type: "button", class: "btn small", text: byId.get(key).title, onclick: () => select(key, true) }))) : null,
      h("h3", { text: "Related titles and vocabulary" }), h("ul", null, data.terms.filter(t => t.nodeId === id).map(t => h("li", { text: t.label + " — " + t.note }))),
      h("a", { class: "btn small", href: "#/governance/" + n.chapter, text: "Read the complete charter" }), h("a", { class: "btn small", href: "#/organization/" + id, text: "Link to this office" })]);
    if (branchMode && fullPosition.has(id)) fit();
    if (move) focusNode(id); if (focus) {
      detailDrawer.open = true; detail.focus();
      requestAnimationFrame(() => { if (!disposed && main.isConnected && !chartDialog.open) ui.scrollToSection?.(detail); });
    }
  }
  for (const node of visible) {
    const p = position.get(node.id), button = h("button", { type: "button", class: "org-node org-node-" + node.relation, "data-organization-node": node.id, "aria-pressed": "false", onclick: () => select(node.id, false, true) }, posIcon(node.icon), h("span", null, h("strong", { text: node.title }), h("small", { text: node.kind })));
    button.style.left = (p.x - 115) + "px"; button.style.top = p.y + "px"; stage.append(button); buttons.set(node.id, button);
  }
  const list = h("section", { class: "org-list", "aria-label": "All offices in reading order" });
  for (const n of data.nodes) {
    const row = h("article", { class: "org-list-row" }, h("button", { type: "button", class: "org-list-title", onclick: () => select(n.id, true, true) }, posIcon(n.icon), h("span", null, h("strong", { text: n.title }), h("small", { text: n.kind }))), h("p", { text: n.remit }), h("p", { class: "small muted", text: n.parent ? `${n.relation}: ${byId.get(n.parent).title}` : "Separate root" }));
    rows.set(n.id, row); list.append(row);
  }
  const chartButton = h("button", { type: "button", class: "btn small", "aria-pressed": "true", text: "Chart", onclick: () => view(false) });
  const listButton = h("button", { type: "button", class: "btn small", "aria-pressed": "false", text: "List", onclick: () => view(true) });
  const chartLocation = h("div", { class: "org-chart-location" });
  const chartDialog = h("dialog", { class: "org-fullscreen", "aria-label": "Organization chart in full screen" },
    h("div", { class: "org-fullscreen-heading" }, h("h2", { text: "Organization of Olympus" }),
      h("button", { type: "button", class: "btn small", text: "Close full screen", onclick: () => chartDialog.close() })));
  const fullScreen = h("button", { type: "button", class: "btn small", text: "Full screen", "aria-expanded": "false", onclick: () => {
    if (chartDialog.open) { chartDialog.close(); return; }
    if (typeof chartDialog.showModal !== "function") { status.textContent = "Full screen is unavailable in this browser. The chart and List view remain available below."; return; }
    stop(); chartDialog.append(chartShell);
    try { chartDialog.showModal(); }
    catch { chartLocation.append(chartShell); status.textContent = "Full screen could not be opened. The chart remains available below."; return; }
    // On a small phone the diagram gets the space first; both disclosures retain their complete text.
    const narrow = typeof matchMedia === "function" && matchMedia("(max-width: 760px)").matches;
    detailDrawer.open = !narrow; chartHelp.open = !narrow;
    fullScreen.textContent = "Exit full screen"; fullScreen.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => { if (chartDialog.open && main.isConnected && !disposed) { present(); viewport.focus(); } });
  } });
  const branchButton = h("button", { type: "button", class: "btn small", text: "Fit branch", "aria-pressed": "false", onclick: fit });
  const overviewButton = h("button", { type: "button", class: "btn small", text: "Full map", "aria-pressed": "true", onclick: overview });
  const chartControls = h("div", { class: "org-chart-tools" }, h("button", { type: "button", class: "btn small", text: "−", "aria-label": "Zoom out", onclick: () => zoom(scale / 1.25) }), zoomStatus, h("button", { type: "button", class: "btn small", text: "+", "aria-label": "Zoom in", onclick: () => zoom(scale * 1.25) }), branchButton, overviewButton, h("button", { type: "button", class: "btn small org-center-selected", text: "Center selected", onclick: () => focusNode(selected) }), fullScreen);
  const chartShell = h("section", { class: "org-chart-shell", "aria-label": "Explore the organization" },
    h("div", { class: "org-toolbar" }, h("label", { for: "organization-search", text: "Find a duty" }), search, chartButton, listButton, chartControls), chartHelp,
    h("div", { class: "org-workspace" }, h("div", { class: "org-explorer" }, viewport, list), detailDrawer));
  chartLocation.append(chartShell);
  for (const disclosure of [detailDrawer, chartHelp]) disclosure.addEventListener("toggle", () => {
    requestAnimationFrame(() => { if (chartDialog.open && main.isConnected && !isList) present(); });
  });
  chartDialog.addEventListener("close", () => {
    stop(); chartLocation.append(chartShell); detailDrawer.open = true; chartHelp.open = true;
    fullScreen.textContent = "Full screen"; fullScreen.setAttribute("aria-expanded", "false");
    requestAnimationFrame(() => { if (main.isConnected && !disposed) { if (!isList) present(); (isList ? listButton : fullScreen).focus(); } });
  });
  function view(asList) { stop(); isList = asList; list.hidden = !asList; viewport.hidden = asList; chartControls.hidden = asList; chartButton.setAttribute("aria-pressed", String(!asList)); listButton.setAttribute("aria-pressed", String(asList)); if (!asList) present(); }
  viewport.addEventListener("keydown", e => {
    if (e.target !== viewport) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) { e.preventDefault(); const step = e.shiftKey ? 120 : 45; x += e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0; y += e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0; transform(); }
    else if (["+", "=", "-", "Home", "0"].includes(e.key)) { e.preventDefault(); if (e.key === "Home" || e.key === "0") fit(); else zoom(scale * (e.key === "-" ? .8 : 1.25)); }
  });
  // A card still clicks normally; movement beyond a small threshold becomes a pan instead.
  viewport.addEventListener("pointerdown", e => {
    if (e.button !== 0 || e.isPrimary === false || dragging) return;
    suppressClick = false;
    dragging = { id: e.pointerId, px: e.clientX, py: e.clientY, x, y, moved: false };
    if (!e.target.closest("button")) { e.preventDefault(); viewport.focus({ preventScroll: true }); viewport.setPointerCapture(e.pointerId); }
  });
  viewport.addEventListener("pointermove", e => {
    if (dragging?.id !== e.pointerId) return;
    const dx = e.clientX - dragging.px, dy = e.clientY - dragging.py;
    if (!dragging.moved && Math.hypot(dx, dy) < 6) return;
    dragging.moved = true; suppressClick = true; e.preventDefault(); viewport.setPointerCapture(e.pointerId);
    viewport.classList.add("is-dragging"); x = dragging.x + dx; y = dragging.y + dy; transform();
  });
  const stop = e => {
    if (e?.pointerId !== undefined && dragging?.id !== e.pointerId) return;
    const id = dragging?.id; dragging = null; viewport.classList.remove("is-dragging");
    if (id !== undefined && viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
  };
  viewport.addEventListener("pointerup", stop); viewport.addEventListener("pointercancel", stop); viewport.addEventListener("lostpointercapture", stop);
  viewport.addEventListener("click", e => { if (suppressClick && e.detail !== 0) { suppressClick = false; e.preventDefault(); e.stopPropagation(); } }, true);
  viewport.addEventListener("selectstart", e => e.preventDefault());
  viewport.addEventListener("wheel", e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); const r = viewport.getBoundingClientRect(); zoom(scale * (e.deltaY < 0 ? 1.12 : .89), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  const termList = h("div", { class: "organization-terms" }), termRows = [];
  for (const [tier, title] of [["leader", "Leader & Reserved Royal Authority"], ["high_council", "High Council Roles"], ["officer_corps", "Officer Corps Roles"], ["member_specialist", "Member & Specialist Roles"]]) {
    const terms = data.terms.filter(t => t.tier === tier), group = h("ul", { class: "org-office-grid", "aria-label": title });
    for (const t of terms) {
      const closed = ui.officeAvailability?.[t.officeKey] === false;
      const li = h("li", { class: "org-office-card", "data-office-key": t.officeKey, "data-office-tier": t.tier }, h("button", { type: "button", class: "organization-term", text: t.label, onclick: () => select(t.nodeId, true, true, t) }), officeBadges(t), t.applicationAliases?.length ? h("p", { class: "small", text: "Application portfolio: " + t.applicationAliases.join(" · ") }) : null,
        h("p", { class: "small", text: t.department }), h("p", { class: "small", text: t.note }), h("p", { class: "small muted", text: termPlacement(t) }),
        h("p", { class: "small muted", text: reservedTerm201(t) ? "Reserved seat — no applications. A missing holder is not a vacancy; leadership fills this office by appointment." : closed ? "This seat is occupied or closed to applications." : t.applicationEligible ? "Ordinary role application available; admission and any later standing are reviewed separately." : t.acquisition }),
        ui.roleGuide201 ? h("details", {class:"org-role-guide201"},h("summary",{text:"Definition, responsibilities & expectations"}),ui.roleGuide201(t.officeKey)) : null);
      group.append(li); termRows.push({t,li});
    }
    termList.append(h("section", { class: "org-office-tier-group", "data-tier-group": tier }, h("h3", { text: title + " · " + terms.length + " stable titles" }), group));
  }
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase(); let count = 0;
    if (q) chartHelp.open = true;
    for (const n of data.nodes) { const matches = !q || [n.title, n.remit, n.limits, ...data.terms.filter(t => t.nodeId === n.id).map(t => t.applicationLabel || t.label)].join(" ").toLowerCase().includes(q); rows.get(n.id).hidden = !matches; buttons.get(n.id)?.classList.toggle("org-node-match", !!q && matches); if (matches) count++; }
    for (const { t, li } of termRows) li.hidden = !!q && ![t.label,t.note,t.applicationLabel,...(t.applicationAliases||[]),t.department,t.tierLabel].join(" ").toLowerCase().includes(q);
    status.textContent = q ? `${count} offices or groups match. Use Full map for all chart matches, or List for a filtered reading view.` : chartSummary();
  });
  const allianceOverview205 = ui.allianceOverview205?.(data, ui, id => {
    relationshipMap205.open = true;
    select(id, false, true);
    fit();
    ui.scrollToSection?.(detail);
  });
  relationshipMap205 = h("details", { class: "org-relationship-map205 frame", open: !allianceOverview205 },
    h("summary", { text: "Explore exact reporting & coordination lines" }));
  relationshipMap205.open = !allianceOverview205;
  relationshipMap205.addEventListener("toggle", () => { if (relationshipMap205.open) requestAnimationFrame(present); });
  add(main, [h("section", { class: "governance-hero" }, posIcon("guild_master"), h("div", null, h("p", { class: "eyebrow", text: "The administration of Olympus" }), h("h1", { text: "Many guilds. One Olympus." }), h("p", { text: "Follow a line of responsibility, find the people a duty serves, and understand where an office’s authority ends." }))),
    h("aside", { class: "org-adoption", role: "note" }, h("strong", { text: "Guild rules adopted · 13 October 2026" }), h("p", { text: "Adopted by the authorized guild administration. An office shown here does not appoint a holder, grant a Council vote or alter game, Discord, website or bank permissions. Individual appointments and actual access remain separately recorded." })),
    h("nav", { class: "governance-quicklinks", "aria-label": "Organization resources" }, h("a", { class: "btn", href: "#/roles/rosetta-stone", text: "Olympus Role & Rank Rosetta Stone" }), h("a", { class: "btn", href: "#/governance/operational-charter-the-work-of-olympus", text: "Read the operational charter" }), h("a", { class: "btn", href: data.directoryRoute, text: "Current appointed leadership" }), h("a", { class: "btn small", href: "#/governance", text: "Complete governance book" })),
    allianceOverview205,
    relationshipMap205,
    h("section", { class: "frame org-rank-guide" }, h("h2", { text: "The Ten In-Game Ranks of Olympus" }), h("p", { text: "High Council is Rank 2 (slot 1). The Officer Corps occupies Ranks 3–5: Officer, Officer Alt and Raid Leader. Co-Guild Master and Treasurer are Council appointments, not extra native ranks." }),
      h("ol", { class: "organization-ranks" }, data.nativeRanks.map(r => h("li", { "data-native-rank": String(r.order) }, h("a", { href:"#/roles/" + encodeURIComponent(ui.roleDirectory203?.ranks?.find(rank=>rank.nativeSlot===r.nativeSlot)?.familyKey || "rosetta-stone"), text:r.name }), h("small", { text: "Rank " + r.order + " · zero-based slot " + r.nativeSlot })))),
      h("p", { class: "small muted", text: "The owner-directed hierarchy is a planning and application guide. Current native installation, signing profiles, accepted appointments, Council votes and actual access require their own records." })),
    h("section", { class: "org-council-overview frame", "aria-label": "High Council offices" }, h("h2", { text: "The High Council at a glance" }),
      h("p", { text: data.councilComposition?.summary || "Guild Master, Co-Guild Master and Treasurer form the core Council offices, supported by accepted portfolio mandates." }),
      h("ul", { class: "org-council-offices" }, (data.councilComposition?.offices || []).map(title => h("li", null, h("strong", { text: title })))),
      data.councilComposition ? h("p", { class: "org-composition-status", role: "note", text: data.councilComposition.formalStatus }) : null,
      h("p", { text: "The Treasurer, Co-Guild Master, MAIN Raid Lead, MAIN PvP Lead and Head of Justice are High Council offices alongside the other current alliance portfolios. Council seats require an accepted appointment. Regional Raid and PvP leads remain distinct Officer Corps responsibilities. Accepted councillors without another portfolio ordinarily serve the Council of Justice, subject to case designation and conflict review." }),
      h("p", { class: "small muted", text: "Systems and Addons remains shared support, with its Council portfolio distinct from specialist advisers. Advisers are not automatically voting councillors. This current composition does not itself issue an eligible vote, individual warrant, native rank or permission. One person still has one vote, subject to recusal." }),
      h("div", { class: "org-composition-links" }, data.councilComposition ? h("a", { href: data.councilComposition.sourcePath, text: "Read the current Council clarification (28 October 2026)" }) : null,
      data.councilComposition?.previousDirection ? h("a", { href: data.councilComposition.previousDirection.sourcePath, text: "Historical Council direction (19–23 October 2026)" }) : null,
      h("a", { href: "#/governance/operational-charter-the-work-of-olympus", text: "Read Operational Charter O3 — The High Council and its offices" }))),
    h("div", { class: "org-guide" }, h("h2", { text: "How to read the chart" }), h("p", { text: "Solid gold arrows point from an office toward the authority it answers to. Dashed blue two-way lines connect partners who coordinate. Dotted violet lines show independent review, never command by the person under review. Select a card to read its mandate. The rank and status groupings below carry no command arrows." }),
      h("p", { class: "small muted", text: "Fit branch keeps the selected office and its direct connections readable. Drag the chart or a card to pan; click a card to read its mandate. Full map gives an overview of every chart office. Use +/−, Ctrl + wheel or ⌘ + wheel to zoom. Focus the chart and use arrow keys to pan, Shift for larger steps, Home or 0 to fit the selected branch. Full screen gives the chart more room; Escape returns to this page. Every office is also available in List view." })),
    chartLocation, chartDialog,
    h("details", { class: "frame org-profile-notes" }, h("summary", { text: "Technical & Historical Profile Notes" }), h("p", { text: data.roleRank199.historicalProfileNote }), h("p", { text: "Older drafts that gave Treasurer a separate native slot are superseded. The historical beta-five client observation and the addon’s second-rank Captain assumption remain evidence to review before real native adoption; this page performs no in-game rank write or key-profile activation. Officer Alt is now the fourth native rank, while the Treasurer key is an appointment alias. No title alone grants bank withdrawal, invitations, key signing or confidential access." })),
    h("section", { class: "frame" }, h("h2", { text: "Olympus I–X · affiliation and succession" }), h("p", { text: "These are directory places for affiliated guilds, not assertions that ten guilds are formed or that their Guild Masters have been appointed. A local Guild Master retains local command while accepting the common charter. Each guild names five correspondents: PvP, Raiding, Finance, Artisanry and Heraldry." }), h("ul", { class: "organization-guilds" }, data.guildPlaceholders.map(g => h("li", null, h("strong", { text: g.name }), h("small", { text: g.state }))))),
    h("section", { class: "frame" }, h("h2", { text: "Role families, duties and expectations" }), h("p", { text: "One guide brings together alternate titles and regional or class specialisms. The chart retains the separate lines of responsibility; grouping guides does not merge appointments, permissions or historical records." }), ui.roleFamilyDirectory203 ? ui.roleFamilyDirectory203() : h("p", { role:"alert", text:"The consolidated role guide is unavailable. Reload before choosing a role." }), h("details", { class:"org-catalogue-history203" }, h("summary", { text:"Historical catalogue records · 95 stable offices / 131 stored keys" }), h("p", { class:"small muted", text:"These original identifiers and scoped records are retained for existing links and records. They are not additional jobs or vacancies. Use the role-family guide above for current definitions and admission options." }), termList))]);
  // Keep the detailed relationship explorer available without shrinking the new default overview.
  for (const node of [...main.children]) {
    if (node.classList?.contains("org-rank-guide") || node.classList?.contains("org-council-overview") || node.classList?.contains("org-guide") || node === chartLocation || node === chartDialog) relationshipMap205.append(node);
  }
  const requestedAssignment199 = (data.appointments || []).find(row => row.key === parts[0]);
  const requestedOffice199 = data.terms.find(term => term.officeKey === (requestedAssignment199?.aliasOf || parts[0]));
  // These fallbacks are display destinations only; they never merge election or appointment identities.
  const displayNode199 = requestedAssignment199?.group === "native" ? "native" : parts[0] === "leveling" ? "events" : parts[0] === "liaison" ? "emissaries" : "council";
  select(byId.has(parts[0]) ? parts[0] : requestedOffice199?.nodeId || displayNode199, false, !!requestedOffice199 || byId.has(parts[0]), requestedOffice199);
  if (parts[0] === "alliance-overview" && allianceOverview205) requestAnimationFrame(() => { if (!disposed && main.isConnected) ui.scrollToSection?.(allianceOverview205); });
  status.textContent = `${data.nodes.length} organizational groups · ${data.terms.length} titles and terms · ten native rank slots.`;
  view(typeof matchMedia === "function" && matchMedia("(max-width: 760px)").matches);
  function present() {
    if (!main.isConnected || isList || disposed) return;
    if (branchMode) fit();
    else {
      overview();
      if (!fullPosition.has(selected)) status.textContent = "Rank and membership groupings have no command arrows. Their full descriptions are available in List. " + chartSummary();
    }
  }
  document.getElementById("organization-view-style").addEventListener("load", present, { once: true });
  requestAnimationFrame(present);
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => requestAnimationFrame(present)) : null;
  if (observer) observer.observe(viewport);
  return () => { disposed = true; if (observer) observer.disconnect(); stop(); if (chartDialog.open) chartDialog.close(); };
}

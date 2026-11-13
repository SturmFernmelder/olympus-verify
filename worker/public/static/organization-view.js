/* Public organization view. Static offices never confer identity, membership or permissions. */
const NS = "http://www.w3.org/2000/svg";
function svg(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}
export function renderOrganization(main, data, ui) {
  const { h, add, clear, posIcon, parts } = ui;
  const nativeRankDisplayName = (slot, name) => slot === 0 ? "Leader (Guild Master)" : name;
  const guildDisplayName229 = name => typeof name === 'string' && /^Olympus(?: I| PRIME)?$/i.test(name) ? 'OLYMPUS PRIME' : name;
  // Evergreen 12 Nov 2026 (CL2-047): a chart node that holds a current Council seat shows that seat's Cabinet title, so the
  // superseded "War Head" and "core portfolio" names leave the chart. The model's parentage is unchanged.
  const seats1112 = data.councilComposition?.currentSeats || [];
  const seatNode1112 = new Map(seats1112.map((seat, index) => [seat.nodeId, { seat, index }]).filter(([id]) => !["founder", "council", "justice"].includes(id)));
  const nodeTitle218 = node => node.id === "native" && node.title === "Ten native rank slots" ? "In-game rank reference" : seatNode1112.get(node.id)?.seat.label || node.title;
  const nodeKind1112 = node => { const held = seatNode1112.get(node.id); return held ? (held.index === 1 ? "High Council · Co-Guild Master" : "High Council portfolio " + (held.index - 1)) : node.kind === "core portfolio" ? "department" : node.kind; };
  // A note repeated on three or more titles is boilerplate; only a note specific to its title is shown (CL2-041, CL2-220).
  const noteCounts1112 = new Map();
  for (const term of data.terms) noteCounts1112.set(term.note, (noteCounts1112.get(term.note) || 0) + 1);
  const specificNote1112 = text => !!text && (noteCounts1112.get(text) || 0) < 3;
  clear(main);
  if (!document.getElementById("organization-view-style")) {
    const link = document.createElement("link"); link.id = "organization-view-style";
    link.rel = "stylesheet"; link.href = "/static/organization-view.css"; document.head.append(link);
  }
  const byId = new Map(data.nodes.map(n => [n.id, n])), buttons = new Map(), rows = new Map();
  const position = new Map(), visible = data.nodes.filter(n => n.relation !== "classification");
  // CL2-062: the High Council's children follow the seat protocol order (a department ranks by the first seat it holds);
  // units without a seat keep their model order after them.
  const seatRank1112 = id => { let best = Infinity;
    seats1112.forEach((seat, index) => { for (let n = byId.get(seat.nodeId); n; n = n.parent ? byId.get(n.parent) : null) if (n.id === id) { best = Math.min(best, index); break; } });
    return best; };
  const bySeat1112 = list => list.map((node, index) => [node, seatRank1112(node.id), index]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(row => row[0]);
  const children = id => { const own = visible.filter(n => n.parent === id); return id === "council" ? bySeat1112(own) : own; };
  const levels = [];
  function collect(node, depth) {
    (levels[depth] ||= []).push(node);
    children(node.id).forEach(n => collect(n, depth + 1));
  }
  visible.filter(n => n.parent === null).forEach(n => collect(n, 0));
  // .176: wrap each level in family order instead of reserving a horizontal column for every leaf.
  // Parentage, directed links and the complete reading order remain the unchanged charter model.
  function cardHeight() { return Math.max(124, ...[...buttons.values()].map(button => button.offsetHeight || 124)); }
  // Reserve one vertical span per subtree; cards and paths share coordinates.
  function compactLayout() {
    const pitch = cardHeight() + 42; let cursor = 30, depthMax = 0;
    position.clear();
    function place(node, depth) {
      depthMax = Math.max(depthMax, depth); const own = children(node.id);
      if (own.length) { const points = own.map(n => place(n, depth + 1)); const y = (points[0] + points[points.length - 1]) / 2; position.set(node.id, { x: 145 + depth * 340, y }); return y; }
      const y = cursor; cursor += pitch; position.set(node.id, { x: 145 + depth * 340, y }); return y;
    }
    visible.filter(n => n.parent === null).forEach(n => place(n, 0));
    return { width: (depthMax + 1) * 340, height: cursor + cardHeight() };
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
    const title = svg("title"); title.textContent = `${nodeTitle218(byId.get(fromId))} → ${nodeTitle218(byId.get(toId))}: ${relation}`; path.append(title); wires.append(path); edges.push({ fromId, toId, path });
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
  // CL2-220: the controls are explained once, here; the status line stays visible above the chart.
  const chartHelp = h("details", { class: "org-chart-help" }, h("summary", { text: "How to use the chart" }),
    h("p", { class: "small muted", text: "Fit branch keeps the selected office and its direct connections readable; Full map shows every chart office. Drag to pan. Pinch with two fingers, use +/−, or hold Ctrl/⌘ while scrolling to zoom. Focus the chart and use arrow keys to pan, Shift for larger steps, and Home or 0 to fit the selected branch. Escape closes full screen. List includes every office and group." }));
  chartHelp.open = false;
  const search = h("input", { type: "search", id: "organization-search", maxlength: "160", placeholder: "Find an office, rank or duty…", "aria-label": "Search all offices and " + data.terms.length + " labels" });
  // CL2-042: the chart opens on the High Council branch at a readable scale; Full map is one click away.
  let scale = 1, x = 0, y = 0, selected = "council", dragging = null, isList = false, suppressClick = false, branchMode = true, disposed = false, relationshipMap205 = null;
  const pointers = new Map();
  let pinch = null;
  const zoomStatus = h("output", { class: "org-zoom", "aria-label": "Chart zoom" });
  function chartSummary() { return branchMode ? `Branch: ${nodeTitle218(byId.get(selected))}. Parent and directly connected offices shown at a readable scale; drag to see the rest. Full map shows all ${visible.length} chart offices; List includes all ${data.nodes.length} groups.` : `Full map overview: all ${visible.length} chart offices. At overview scale, select an office and choose Fit branch to read it, or use List.`; }
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
      const ah = buttons.get(e.fromId).offsetHeight || 124, bh = buttons.get(e.toId).offsetHeight || 124;
      if (a.x !== b.x) {
        const direction = b.x > a.x ? 1 : -1, startX = a.x + direction * 115, endX = b.x - direction * 115;
        const middle = (startX + endX) / 2, startY = a.y + ah / 2, endY = b.y + bh / 2;
                if (Math.abs(a.x-b.x) > 340) {
          const first=startX+direction*28,last=endX-direction*28;
          e.path.setAttribute("d","M "+startX+" "+startY+" L "+first+" "+startY+" L "+first+" 12 L "+last+" 12 L "+last+" "+endY+" L "+endX+" "+endY);
        } else e.path.setAttribute("d","M "+startX+" "+startY+" L "+middle+" "+startY+" L "+middle+" "+endY+" L "+endX+" "+endY);
      } else {
        const startY = a.y + ah / 2, endY = b.y + bh / 2, outside = a.x + 148;
        e.path.setAttribute("d", "M "+(a.x+115)+" "+startY+" L "+outside+" "+startY+" L "+outside+" "+endY+" L "+(b.x+115)+" "+endY);
      }
      e.path.setAttribute("data-from", e.fromId); e.path.setAttribute("data-to", e.toId);
      e.path.setAttribute("data-start-port", "card-border"); e.path.setAttribute("data-end-port", "card-border");
    }
  }
  function branchLayout() {
    const n = byId.get(selected); if (!n || !fullPosition.has(selected)) return null;
    const parent = n.parent && fullPosition.has(n.parent) ? byId.get(n.parent) : null;
    const related = bySeat1112(visible.filter(o => o.id !== selected && o.id !== parent?.id && (o.parent === selected || n.coordinates.includes(o.id) || o.coordinates.includes(selected))));
    // Only presentation changes: relationship direction, kind and mandate text still come from the unchanged model.
    const pitch = cardHeight() + 42, chartWidth = parent ? 1020 : 680;
    const count = Math.max(1, related.length), chartHeight = count * pitch + 60;
    // CL2-042: a tall branch (the Council has thirteen children) starts at the top, so the first paint shows the office,
    // its parent and its first children rather than the middle of the list.
    const centerY = chartHeight > 900 ? 30 : (chartHeight - cardHeight()) / 2;
    position.clear(); if (parent) position.set(parent.id, { x: 145, y: centerY });
    const selectedX = parent ? 485 : 145;
    position.set(selected, { x: selectedX, y: centerY });
    related.forEach((o, i) => position.set(o.id, { x: selectedX + 340, y: 30 + i * pitch }));
    drawLayout(new Set(position.keys()), chartWidth, chartHeight); return { width: chartWidth, height: chartHeight };
  }
  function transform() { stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`; zoomStatus.textContent = Math.round(scale * 100) + "%"; }
  function zoom(next, cx = viewport.clientWidth / 2, cy = viewport.clientHeight / 2, chartX = (cx - x) / scale, chartY = (cy - y) / scale) {
    scale = Math.max(.05, Math.min(2, next)); x = cx - chartX * scale; y = cy - chartY * scale; transform();
  }
  function fit() {
    const size = branchLayout(); if (!size) { overview(); status.textContent = "Rank and membership groupings have no command arrows. Their full descriptions are available in List. " + chartSummary(); return; }
    branchMode = true; const w = viewport.clientWidth || 850, ht = viewport.clientHeight || 620;
    // A large branch can pan instead of reducing office labels to unreadable thumbnails.
    scale = Math.max(.85, Math.min(1, (w - 32) / size.width, (ht - 32) / size.height)); x = (w - size.width * scale) / 2; y = Math.min(16, ht / 2 - ((position.get(selected)?.y || 0) + cardHeight()/2) * scale);
    overviewButton.setAttribute("aria-pressed", "false"); branchButton.setAttribute("aria-pressed", "true"); status.textContent = chartSummary(); transform();
  }
  function overview() {
    branchMode = false; const w = viewport.clientWidth || 850, ht = viewport.clientHeight || 620;
    const size = compactLayout(w); drawLayout(new Set(position.keys()), size.width, size.height);
    scale = Math.max(.05, Math.min(1, (w - 32) / size.width, (ht - 32) / size.height)); x = (w - size.width * scale) / 2; y = (ht - size.height * scale) / 2;
    overviewButton.setAttribute("aria-pressed", "true"); branchButton.setAttribute("aria-pressed", "false"); status.textContent = chartSummary(); transform();
  }
  function focusNode(id) { if (branchMode) branchLayout(); const p = position.get(id); if (!p) return; scale = Math.max(.85, scale); x = viewport.clientWidth / 2 - p.x * scale; y = Math.max(50, viewport.clientHeight / 3) - p.y * scale; transform(); }
  const reservedTerm201 = term => term.reservedSeat201 || ["leader", "high_council", "officer_corps"].includes(term.tier);
  const termFamily218 = term => ui.roleDirectory203?.families?.find(row => row.key === ui.roleDirectory203.keyToFamily[term.officeKey]);
  // CL2-036: one eligibility rule with /#/roles. A link appears exactly where the directory lists an intent the Worker
  // accepts (validateApplicationIntent199); Core Raider (office_25) is such a target on the Raider track.
  const targetLabel1112 = (family, target) => target.targetOffice ? (ui.officeFor219?.(target.targetOffice)?.applicationLabel || family.label) : family.label;
  const applicationLink = (family, target, label) => {
    if (!target || ui.officeAvailability?.[target.targetOffice || family.primaryKey] === false) return null;
    return h("a", { class: "btn small org-seat-apply", href: "#/vote/" + target.applicationTrack + "/" + encodeURIComponent(target.targetOffice || "new"), "data-office-application": target.targetOffice || family.primaryKey, "data-application-track": target.applicationTrack, text: label });
  };
  const termTarget1112 = term => { const family = termFamily218(term), targets = family?.applicationTargets || [];
    return reservedTerm201(term) ? null : targets.find(target => target.targetOffice === term.officeKey) || (targets.every(target => target.targetOffice === null) ? targets[0] : null) || null; };
  const seatLink = term => { const target = termTarget1112(term), family = termFamily218(term); return target ? applicationLink(family, target, "Apply as " + targetLabel1112(family, target)) : null; };
  const applicationLinks = (ui.roleDirectory203?.families || []).flatMap(family => (family.applicationTargets || []).map(target => applicationLink(family, target, "Apply as " + targetLabel1112(family, target)))).filter(Boolean);
  const officeBadges = term => h("p", { class: "org-office-badges" },
    h("span", { class: "org-tier-badge org-tier-" + term.tier, text: termFamily218(term)?.kind === "institution" ? "Governance institution" : term.tierLabel }),
    termFamily218(term)?.kind === "institution" || !Number.isInteger(term.nativeSlot) ? null : h("span", { class: "small", text: "Rank " + term.nativeRankOrdinal + " " + nativeRankDisplayName(term.nativeSlot, term.nativeRankName) + " · Slot " + term.nativeSlot }),
    h("span", { class: "small", text: term.codexTitles.map(title => "Title " + title).join(" · ") }));
  function select(id, move = false, focus = false, term = null) {
    const n = byId.get(id); if (!n) return; selected = id; detailSummary.textContent = "Office details · " + nodeTitle218(n);
    if ((move || focus) && relationshipMap205) relationshipMap205.open = true;
    for (const [key, button] of buttons) button.setAttribute("aria-pressed", String(key === id));
    for (const e of edges) e.path.classList.toggle("org-edge-active", e.fromId === id || e.toId === id);
    const offices = (data.officeMandates || []).filter(o => o.nodeId === id);
    const roleTerm = term || data.terms.find(entry => entry.nodeId === id && ui.roleDirectory203?.keyToFamily[entry.officeKey]);
    const roleKey = id === "activity" ? "pvp_team" : ui.roleDirectory203?.keyToFamily[roleTerm?.officeKey];
    const family = term ? termFamily218(term) : null, institution = family?.kind === "institution";
    const nodeTerms = data.terms.filter(t => t.nodeId === id), titleSet = [...new Set((term ? [term] : nodeTerms).flatMap(t => t.codexTitles || []))];
    const slotTerm = term || nodeTerms.find(t => Number.isInteger(t.nativeSlot));
    clear(detail); add(detail, [h("p", { class: "eyebrow", text: nodeKind1112(n) }), h("h2", { text: nodeTitle218(n) }),
      term ? h("p", { text: institution ? family.label + ": a collective institution, separate from the individual Council portfolios." : specificNote1112(term.note) ? term.label + ": " + term.note : term.label }) : null,
      term ? officeBadges(term) : null,
      term ? seatLink(term) : null,
      h("h3", { text: "Purpose" }), h("p", { text: n.remit }), h("h3", { text: "Authority and boundaries" }), h("p", { text: n.limits }),
      h("p", { class: "org-relation", text: n.parent ? `${n.relation === "accountability" ? "Accountable to" : n.relation === "independence" ? "Independent review remit connected to" : "Coordinates through"}: ${nodeTitle218(byId.get(n.parent))}.` : "Constitutional root; no reporting parent in this model." }),
      // CL2-041: a long mandate list (the ten Class Heads) is collapsed behind one summary line.
      offices.length ? (() => { const cards = offices.map(o => h("article", { class: "org-mandate" }, h("h4", { text: o.title }), h("p", { text: o.duty }), h("p", { class: "small", text: "Record of work: " + o.output }), h("p", { class: "small muted", text: "Appointment and limits: " + o.boundary })));
        return offices.length > 3 ? h("details", { class: "org-mandates1112" }, h("summary", { text: offices.length + " offices and working mandates" }), cards) : h("div", null, h("h3", { text: "Offices and working mandates" }), cards); })() : null,
      n.coordinates.length ? h("div", null, h("h3", { text: "Working relationships" }), n.coordinates.map(key => h("button", { type: "button", class: "btn small", text: nodeTitle218(byId.get(key)), onclick: () => select(key, true) }))) : null,
      nodeTerms.length ? [h("h3", { text: "Titles in this office" }), h("ul", null, nodeTerms.map(t => h("li", null, h("a", { href: "#/roles/" + encodeURIComponent(t.officeKey), text: t.applicationLabel || t.label }), specificNote1112(t.note) ? " — " + t.note : "")))] : null,
      h("div", { class: "role-reference-links228 role-see-also1112", role: "group", "aria-label": "See also" }, h("span", { class: "small muted", text: "See also:" }),
        roleKey ? h("a", { href: "#/roles/" + encodeURIComponent(term?.officeKey || roleKey), text: "Role guide" }) : null,
        h("a", { href: "#/governance/" + n.chapter, text: "Organisation and Offices (governance)" }),
        ...titleSet.filter(title => ui.titleRoutes?.[title]).map(title => h("a", { href: "#/governance/" + ui.titleRoutes[title], text: "Title " + title })),
        slotTerm && Number.isInteger(slotTerm.nativeSlot) ? h("a", { href: "#/roles/rosetta-rank-" + (slotTerm.nativeSlot + 1), text: "Rosetta Stone · Rank " + (slotTerm.nativeSlot + 1) }) : null,
        h("a", { href: "#/organization/" + encodeURIComponent(term?.officeKey || id), text: "Link to this office" }))]);
    if (branchMode && fullPosition.has(id)) fit();
    if (move) focusNode(id); if (focus) {
      detailDrawer.open = true; detail.focus();
      requestAnimationFrame(() => { if (!disposed && main.isConnected && !chartDialog.open) ui.scrollToSection?.(detail); });
    }
  }
  for (const node of visible) {
    const p = position.get(node.id), button = h("button", { type: "button", class: "org-node org-node-" + node.relation, "data-organization-node": node.id, "aria-pressed": "false", onclick: () => select(node.id, false, true) }, posIcon(node.icon), h("span", null, h("strong", { text: nodeTitle218(node) }), h("small", { text: nodeKind1112(node) })));
    button.style.left = (p.x - 115) + "px"; button.style.top = p.y + "px"; stage.append(button); buttons.set(node.id, button);
  }
  const list = h("section", { class: "org-list", "aria-label": "All offices in reading order" });
  for (const n of data.nodes) {
    const row = h("article", { class: "org-list-row" }, h("button", { type: "button", class: "org-list-title", onclick: () => select(n.id, true, true) }, posIcon(n.icon), h("span", null, h("strong", { text: nodeTitle218(n) }), h("small", { text: nodeKind1112(n) }))), h("p", { text: n.remit }), h("p", { class: "small muted", text: n.parent ? `${n.relation}: ${nodeTitle218(byId.get(n.parent))}` : "Separate root" }));
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
  const branchButton = h("button", { type: "button", class: "btn small", text: "Fit branch", "aria-pressed": "true", onclick: fit });
  const overviewButton = h("button", { type: "button", class: "btn small", text: "Full map", "aria-pressed": "false", onclick: overview });
  const chartControls = h("div", { class: "org-chart-tools" }, h("button", { type: "button", class: "btn small", text: "−", "aria-label": "Zoom out", onclick: () => zoom(scale / 1.25) }), zoomStatus, h("button", { type: "button", class: "btn small", text: "+", "aria-label": "Zoom in", onclick: () => zoom(scale * 1.25) }), branchButton, overviewButton, h("button", { type: "button", class: "btn small org-center-selected", text: "Center selected", onclick: () => focusNode(selected) }), fullScreen);
  const chartShell = h("section", { class: "org-chart-shell", "aria-label": "Explore the organization" },
    h("div", { class: "org-toolbar" }, h("label", { for: "organization-search", text: "Find a duty" }), search, chartButton, listButton, chartControls), status, chartHelp,
    h("div", { class: "org-workspace" }, h("div", { class: "org-explorer" }, viewport, list), detailDrawer));
  chartLocation.append(chartShell);
  for (const disclosure of [detailDrawer, chartHelp]) disclosure.addEventListener("toggle", () => {
    requestAnimationFrame(() => { if (chartDialog.open && main.isConnected && !isList) present(); });
  });
  chartDialog.addEventListener("close", () => {
    stop(); chartLocation.append(chartShell); detailDrawer.open = true; chartHelp.open = false;
    fullScreen.textContent = "Full screen"; fullScreen.setAttribute("aria-expanded", "false");
    requestAnimationFrame(() => { if (main.isConnected && !disposed) { if (!isList) present(); (isList ? listButton : fullScreen).focus(); } });
  });
  function view(asList) { stop(); isList = asList; list.hidden = !asList; viewport.hidden = asList; chartControls.hidden = asList; chartButton.setAttribute("aria-pressed", String(!asList)); listButton.setAttribute("aria-pressed", String(asList)); if (!asList) present(); }
  viewport.addEventListener("keydown", e => {
    if (e.target !== viewport) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) { e.preventDefault(); const step = e.shiftKey ? 120 : 45; x += e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0; y += e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0; transform(); }
    else if (["+", "=", "-", "Home", "0"].includes(e.key)) { e.preventDefault(); if (e.key === "Home" || e.key === "0") fit(); else zoom(scale * (e.key === "-" ? .8 : 1.25)); }
  });
  function pinchFrame() {
    const [a, b] = pointers.values(), rect = viewport.getBoundingClientRect();
    return {
      cx: (a.clientX + b.clientX) / 2 - rect.left,
      cy: (a.clientY + b.clientY) / 2 - rect.top,
      distance: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)),
    };
  }
  // A card still clicks normally; movement beyond a small threshold becomes a pan instead.
  viewport.addEventListener("pointerdown", e => {
    const touch = e.pointerType === "touch", first = pointers.values().next().value;
    if (e.button !== 0 || (first ? !touch || !first.touch || pointers.size >= 2 : e.isPrimary === false)) return;
    const point = { clientX: e.clientX, clientY: e.clientY, touch };
    pointers.set(e.pointerId, point);
    if (first) {
      // Pinching never activates an office card, even if the two contacts barely move.
      const { cx, cy, distance } = pinchFrame();
      pinch = { scale, distance, chartX: (cx - x) / scale, chartY: (cy - y) / scale };
      dragging = null; suppressClick = true;
      viewport.classList.add("is-dragging");
      for (const id of pointers.keys()) if (!viewport.hasPointerCapture(id)) viewport.setPointerCapture(id);
      return;
    }
    suppressClick = false;
    dragging = { px: point.clientX, py: point.clientY, x, y, moved: false };
    if (!e.target.closest("button")) { e.preventDefault(); viewport.focus({ preventScroll: true }); viewport.setPointerCapture(e.pointerId); }
  });
  viewport.addEventListener("pointermove", e => {
    const point = pointers.get(e.pointerId);
    if (!point) return;
    point.clientX = e.clientX; point.clientY = e.clientY;
    if (pinch) {
      const { cx, cy, distance } = pinchFrame();
      e.preventDefault(); zoom(pinch.scale * distance / pinch.distance, cx, cy, pinch.chartX, pinch.chartY);
      return;
    }
    const dx = e.clientX - dragging.px, dy = e.clientY - dragging.py;
    if (!dragging.moved && Math.hypot(dx, dy) < 6) return;
    dragging.moved = true; suppressClick = true; e.preventDefault();
    if (!viewport.hasPointerCapture(e.pointerId)) viewport.setPointerCapture(e.pointerId);
    viewport.classList.add("is-dragging"); x = dragging.x + dx; y = dragging.y + dy; transform();
  });
  const stop = e => {
    if (e?.type === "lostpointercapture" && e.target !== viewport) return;
    if (e && !pointers.has(e.pointerId)) return;
    const ended = e ? [e.pointerId] : [...pointers.keys()];
    for (const id of ended) pointers.delete(id);
    const remaining = pointers.values().next().value;
    // Rebase the one-finger pan at the last pinch position so the chart never jumps.
    pinch = null;
    dragging = remaining ? { px: remaining.clientX, py: remaining.clientY, x, y, moved: true } : null;
    if (!remaining) viewport.classList.remove("is-dragging");
    for (const id of ended) if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
  };
  viewport.addEventListener("pointerup", stop); viewport.addEventListener("pointercancel", stop); viewport.addEventListener("lostpointercapture", stop);
  viewport.addEventListener("click", e => { if (suppressClick && e.detail !== 0) { suppressClick = false; e.preventDefault(); e.stopPropagation(); } }, true);
  viewport.addEventListener("selectstart", e => e.preventDefault());
  viewport.addEventListener("wheel", e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); const r = viewport.getBoundingClientRect(); zoom(scale * (e.deltaY < 0 ? 1.12 : .89), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  const termList = h("div", { class: "organization-terms" }), termRows = [];
  // Evergreen 12 Nov 2026 (CL2-034, CL2-062, CL2-198): the register uses the directory's six catalogue groups in family order;
  // within the Council group the Leader's titles come first, then the thirteen seats in protocol order, then the
  // institutions and aliases. Each card names its own title; an institution's family is its subtitle.
  const directory1112 = ui.roleDirectory203, catalog1112 = Array.isArray(directory1112?.groups) && directory1112.groups.length === 6 ? directory1112.groups : null;
  const familyIndex1112 = new Map((directory1112?.families || []).map((family, index) => [family.key, index]));
  const seatKeys1112 = seats1112.filter(seat => seat.id !== "gm-chair").map(seat => seat.officeKeys[0]);
  const termSort1112 = t => {
    const family = termFamily218(t), seat = seatKeys1112.indexOf(t.officeKey), own = family?.primaryKey === t.officeKey ? 0 : 1;
    if (family?.key === "leader") return own * 1e3 + t.ordinal;
    if (family?.group === "council" && seat >= 0) return 1e4 + seat;
    // REV-GOV-5 (12 Nov 2026): a retained alias of a seat (Vice Guild Master, Co-GM family) sits right after its seat.
    const familySeat = family?.group === "council" ? seatKeys1112.indexOf(family.primaryKey) : -1;
    if (familySeat >= 0) return 1e4 + familySeat + 0.1 + t.ordinal / 1e4;
    return 1e5 + (familyIndex1112.get(family?.key) ?? 999) * 1e3 + own * 500 + t.ordinal;
  };
  const registerGroups1112 = catalog1112 ? catalog1112.map(group => ({ key: group.key, title: group.label, terms: data.terms.filter(t => termFamily218(t)?.group === group.key).sort((a, b) => termSort1112(a) - termSort1112(b)) }))
    : [["leader", "Leader & Reserved Royal Authority"], ["high_council", "High Council Roles"], ["officer_corps", "Officer Corps Roles"], ["member_specialist", "Member & Specialist Roles"]].map(([key, title]) => ({ key, title, terms: data.terms.filter(t => t.tier === key) }));
  const unplaced1112 = catalog1112 ? data.terms.filter(t => !registerGroups1112.some(group => group.terms.includes(t))) : [];
  if (unplaced1112.length) registerGroups1112.push({ key: "other", title: "Other titles", terms: unplaced1112 });
  for (const { key: groupKey, title, terms } of registerGroups1112) {
    const group = h("ul", { class: "org-office-grid", "aria-label": title });
    for (const t of terms) {
      const closed = ui.officeAvailability?.[t.officeKey] === false;
      const family = termFamily218(t), target = termTarget1112(t);
      const aliasLabels = t.applicationAliases?.length ? h("p", { class: "small", text: "Retained portfolio labels: " + t.applicationAliases.join(" · ") }) : null;
      const historicalAliases = aliasLabels && (family?.kind === "institution" || t.applicationMetadataScope) ? h("details", {class:"org-register-context218", "data-historical-application-labels218":t.officeKey},
        h("summary", {text:"Historical application & ballot labels"}), h("p", {class:"small muted",text:t.applicationMetadataScope || "Earlier application vocabulary is retained for record compatibility; it does not open this institution to applications."}), aliasLabels) : aliasLabels;
      const historicalOfficeLabels = t.historicalOfficeLabels?.length ? h("details", { class: "org-register-context218", "data-historical-office-labels": t.officeKey },
        h("summary", { text: "Historical office labels" }), h("p", { class: "small", text: t.historicalOfficeLabels.join(" · ") })) : null;
      const eligibility = reservedTerm201(t) || family?.eligibility === "reserved_seat" ? null
        : target ? (closed ? h("p", { class: "small muted", text: "This seat is occupied or closed to applications." }) : seatLink(t))
        : h("p", { class: "small muted", text: (ui.eligibilityLabel?.(family) || "Standing") + (t.acquisition && !/^Apply\b/.test(t.acquisition) ? ". " + t.acquisition : ".") });
      const li = h("li", { class: "org-office-card", "data-office-key": t.officeKey, "data-office-tier": t.tier },
        h("button", { type: "button", class: "organization-term", text: t.applicationLabel || t.label, onclick: () => select(t.nodeId, true, true, t) }),
        family?.kind === "institution" ? h("p", { class: "small muted", text: family.label }) : null, officeBadges(t), historicalAliases, historicalOfficeLabels,
        h("p", { class: "small", text: t.department === "Ten native rank slots" ? "In-game rank reference" : t.department }), specificNote1112(t.note) ? h("p", { class: "small", text: t.note }) : null,
        eligibility,
        h("a", { class: "btn small", href: "#/roles/" + encodeURIComponent(t.officeKey),
          "aria-label": "Read the full role guide for " + (t.applicationLabel || t.label), text: "Read the full role guide" }));
      group.append(li); termRows.push({t,li});
    }
    termList.append(h("section", { class: "org-office-tier-group", "data-catalog-group": groupKey }, h("h3", { text: title + " · " + terms.length + " offices" }), group));
  }
  // CL2-190: one index per title (labels, aliases, historical labels, key and department) serves the chart and the register.
  const termIndex1112 = t => [t.label, t.applicationLabel, ...(t.applicationAliases || []), ...(t.historicalOfficeLabels || []), t.officeKey, t.department, t.tierLabel, termFamily218(t)?.label].filter(Boolean).join(" ").toLowerCase();
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase(); let count = 0, outside = 0;
    for (const n of data.nodes) {
      const matches = !q || [nodeTitle218(n), n.title, n.remit, n.limits, ...data.terms.filter(t => t.nodeId === n.id).map(termIndex1112)].join(" ").toLowerCase().includes(q);
      rows.get(n.id).hidden = !matches; buttons.get(n.id)?.classList.toggle("org-node-match", !!q && matches);
      if (matches) { count++; if (q && buttons.get(n.id)?.hidden) outside++; }
    }
    for (const { t, li } of termRows) li.hidden = !!q && !termIndex1112(t).includes(q);
    status.textContent = q ? `${count} offices or groups match${outside ? `; ${outside} are outside this branch. Choose Full map to see them, or List for a filtered reading view` : ""}.` : chartSummary();
  });
  const allianceOverview205 = ui.allianceOverview205?.(data, ui, id => {
    relationshipMap205.open = true;
    select(id, false, true);
    fit();
    ui.scrollToSection?.(detail);
  });
  // CL2-043: on a phone the map starts closed (one tap opens it) and the alliance groups start collapsed.
  const narrow1112 = typeof matchMedia === "function" && matchMedia("(max-width: 760px)").matches;
  relationshipMap205 = h("details", { class: "org-relationship-map205 frame", open: !narrow1112 },
    h("summary", { text: "Organization chart · reporting & coordination lines" }));
  relationshipMap205.open = !narrow1112;
  relationshipMap205.addEventListener("toggle", () => { if (relationshipMap205.open) requestAnimationFrame(present); });
  const adoption1112 = h("aside", { class: "org-adoption", role: "note" }, h("strong", { text: "Guild rules adopted · 13 October 2026" }),
    h("p", { text: "An office shown here appoints no holder, grants no Council vote and changes no game, Discord, website or bank permission; appointments and access are recorded separately. " + (ui.reservedNotice201 || "Leader, High Council and Officer Corps seats are reserved appointments. You cannot apply for them, including when no holder is listed.") + " Collective institutions and their case panels are not additional seats." }));
  const registerDetails1112 = h("details", { class:"org-catalogue-history203" }, h("summary", { text:"Office register · " + data.roleRank199.officeCount + " offices / " + data.roleRank199.assignableKeyCount + " assignment keys" }), h("p", { class:"small muted", text:"The register keeps original identifiers for existing links. See Roles for current definitions and application options." }), termList);
  const rankGuide1112 = h("section", { class: "frame org-rank-guide" }, h("h2", { text: "The Ten In-Game Ranks of Olympus" }), h("p", { text: "The in-game name for slot 0 is Guild Master. High Council is Rank 2 (slot 1). The Officer Corps occupies Ranks 3–5: Officer, Officer Alt and Raid Leader. Co-Guild Master and Treasurer are Council appointments, not extra native ranks." }),
      h("ol", { class: "organization-ranks" }, data.nativeRanks.map(r => h("li", { "data-native-rank": String(r.order) }, h("a", { href:"#/roles/" + encodeURIComponent(ui.roleDirectory203?.ranks?.find(rank=>rank.nativeSlot===r.nativeSlot)?.familyKey || "rosetta-stone"), text:nativeRankDisplayName(r.nativeSlot, r.name) }), h("small", { text: "Rank " + r.order + " · Slot " + r.nativeSlot })))),
      h("p", { class: "small muted", text: "The owner-directed hierarchy is a planning and application guide. Current native installation, signing profiles, accepted appointments, Council votes and actual access require their own records." }));
  const councilGlance1112 = h("section", { class: "org-council-overview frame", "aria-label": "High Council offices" }, h("h2", { text: "The High Council at a glance" }),
      data.councilComposition ? h("p", { text: data.councilComposition.summary }) : null,
      h("ul", { class: "org-council-offices" }, (data.councilComposition?.offices || []).map(title => h("li", null, h("strong", { text: title })))),
      data.councilComposition ? h("p", { class: "org-composition-status", role: "note", text: data.councilComposition.formalStatus }) : null,
      h("p", { text: "Council seats require an accepted appointment. Regional Raid and PvP leads remain distinct Officer Corps responsibilities. Council of Justice panel service requires case designation and conflict review." }),
      h("p", { class: "small muted", text: "Systems & Heraldry sets stewardship and heraldic standards. Technical operators remain responsible for their own systems. The Herald directs campaigns and the Seneschal directs court protocol. Advisers are not automatically voting councillors. This current composition does not itself issue an eligible vote, individual warrant, native rank or permission. One person still has one vote, subject to recusal." }),
      h("div", { class: "org-composition-links" }, data.councilComposition ? h("a", { href: data.councilComposition.sourcePath, text: "Read the current Council reference" }) : null,
      data.councilComposition?.previousDirection ? h("a", { href: data.councilComposition.previousDirection.sourcePath, text: "Historical Council direction (19–23 October 2026)" }) : null,
      h("a", { href: "#/governance/operational-charter-the-work-of-olympus", text: "Read Operational Charter O3 — The High Council and its offices" })));
  add(main, [h("section", { class: "governance-hero" }, posIcon("guild_master"), h("div", null, h("p", { class: "eyebrow", text: "The administration of Olympus" }), h("h1", { text: "Organization" }), h("p", { text: "Follow a line of responsibility, find the people a duty serves, and understand where an office’s authority ends." }))),
    // CL2-063: a jump list for the page's main parts.
    ui.jumpList?.([{ label: "Chart", target: relationshipMap205 }, { label: "High Council", target: councilGlance1112 }, { label: "Alliance overview", target: allianceOverview205 }, { label: "Ranks", target: rankGuide1112 }, { label: "Office register", target: registerDetails1112 }]),
    h("nav", { class: "governance-quicklinks", "aria-label": "Organization resources" }, h("a", { class: "btn", href: "#/roles/rosetta-stone", text: "Rosetta Stone" }), h("a", { class: "btn", href: "#/governance/operational-charter-the-work-of-olympus", text: "Operational charter" }), h("a", { class: "btn", href: data.directoryRoute, text: "Current appointed leadership" }), h("a", { class: "btn", href: "#/governance", text: "Governance book" })),
    relationshipMap205,
    adoption1112,
    allianceOverview205,
    rankGuide1112,
    councilGlance1112,
    h("div", { class: "org-guide" }, h("h2", { text: "How to read the chart" }), h("p", { text: "Solid gold arrows point from an office toward the authority it answers to. Dashed blue two-way lines connect partners who coordinate. Dotted violet lines show independent review, never command by the person under review. Select a card to read its mandate. The rank and status groupings below carry no command arrows. The controls are under “How to use the chart” above the map." })),
    chartLocation, chartDialog,
    h("details", { class: "frame org-profile-notes" }, h("summary", { text: "Technical & Historical Profile Notes" }), h("p", { text: data.roleRank199.historicalProfileNote }), h("p", { text: "Older drafts that gave Treasurer a separate native slot are superseded. The historical beta-five client observation and the addon’s second-rank Captain assumption remain evidence to review before real native adoption; this page performs no in-game rank write or key-profile activation. Officer Alt is now the fourth native rank, while the Treasurer key is an appointment alias. No title alone grants bank withdrawal, invitations, key signing or confidential access." })),
    // CL2-043: the ten directory places are a disclosure, closed on phones.
    h("details", { class: "frame org-alliance-group1112", open: !narrow1112 }, h("summary", null, h("h2", { text: "OLYMPUS PRIME / Olympus II–X · affiliation and succession" })), h("p", { text: "These are directory places for affiliated guilds, not assertions that ten guilds are formed or that their Guild Masters have been appointed. A local Guild Master retains local command while accepting the common charter. Each guild names five correspondents: PvP, Raiding, Finance, Artisanry and Heraldry." }), h("ul", { class: "organization-guilds" }, data.guildPlaceholders.map(g => h("li", null, h("strong", { text: guildDisplayName229(g.name) }), h("small", { text: g.state }))))),
    h("section", { class: "frame" }, h("h2", { text: "Role guides and office register" }),
      h("p", { text: "The Roles directory brings alternate titles and regional or class duties into their complete family guides. Use the chart here for lines of responsibility." }),
      h("a", { class: "btn small", href: "#/roles", text: "Explore the role directory" }),
      applicationLinks.length ? h("div", { class: "btn-row", role: "group", "aria-label": "Ordinary applications" }, applicationLinks) /* INT-GOV-1: a link row, not a landmark */ : null,
      registerDetails1112)]);
  // Show the interactive map before its longer rank, Council and reading references.
  const mapReadingSections221 = [...main.children].filter(node => node.classList?.contains("org-rank-guide") || node.classList?.contains("org-council-overview") || node.classList?.contains("org-guide"));
  for (const node of [chartLocation, chartDialog, ...mapReadingSections221]) relationshipMap205.append(node);
  // Match the encoded assignment links emitted by the shared Rosetta table.
  // Decode once, as other SPA readers do; malformed input is simply no match.
  let requested = "";
  try { requested = decodeURIComponent(parts[0] || ""); } catch { /* Keep the default selection. */ }
  const requestedAssignment199 = (data.appointments || []).find(row => row.key === requested);
  const requestedOffice199 = data.terms.find(term => term.officeKey === (requestedAssignment199?.aliasOf || requested));
  // These fallbacks are display destinations only; they never merge election or appointment identities.
  const displayNode199 = requestedAssignment199?.group === "native" ? "native" : requested === "leveling" ? "events" : requested === "liaison" ? "emissaries" : "council";
  select(byId.has(requested) ? requested : requestedOffice199?.nodeId || displayNode199, false, !!requestedOffice199 || byId.has(requested), requestedOffice199);
  if (requested === "alliance-overview" && allianceOverview205) requestAnimationFrame(() => { if (!disposed && main.isConnected) ui.scrollToSection?.(allianceOverview205); });
  status.textContent = `${data.nodes.length} organizational groups · ${data.terms.length} titles and terms · In-game rank reference: ten ranks.`;
  view(false);
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

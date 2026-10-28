/* A read-only officer plan and an ephemeral, local-only scenario calculator. */
import { TREASURY_PLAN207 } from "/static/treasury-plan-content207.js";
import { TREASURY_DEFAULTS207, TREASURY_FIELDS207, TREASURY_GOAL207, calculateTreasury207 } from "/static/treasury-plan-model207.js";

const gold207 = value => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value) + "g";
const number207 = value => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);

export function renderTreasuryPlan207(main, ui) {
  const { h, clear } = ui;
  if (ui.isCurrent && !ui.isCurrent()) return () => {};
  if (!document.getElementById("treasury-plan-style207")) {
    document.head.append(h("link", { id: "treasury-plan-style207", rel: "stylesheet", href: "/static/treasury-plan207.css" }));
  }
  clear(main);
  const root = h("article", { class: "treasury-plan207", "aria-labelledby": "treasury-plan-title207" });
  main.append(root);
  const chapters = [], controls = new Map(), fieldErrors = new Map();
  function table207(headers, rows, caption) {
    return h("div", { class: "tp207-table-wrap", tabindex: "0", role: "region", "aria-label": caption },
      h("table", null, h("caption", { text: caption }), h("thead", null, h("tr", null, headers.map(text => h("th", { scope: "col", text })))),
        h("tbody", null, rows.map(row => h("tr", null, row.map((text, index) => h(index === 0 ? "th" : "td", index === 0 ? { scope: "row", text } : { text })))))));
  }
  const header = h("header", { class: "tp207-hero" },
    h("p", { class: "tp207-eyebrow", text: "Many guilds. One sustainable treasury." }),
    h("h1", { id: "treasury-plan-title207", text: TREASURY_PLAN207.title || "Olympus Treasury Programme" }),
    h("p", { class: "tp207-intro", text: TREASURY_PLAN207.subtitle || "A shared aim, an honest economic model and a practical officer roadmap." }),
    h("p", { class: "tp207-state", text: "Planning programme · Start date not set · No fundraising campaign or paid service activated" }));
  root.append(header);
  root.append(h("div", { class: "tp207-metrics", "aria-label": "Programme baseline and proposed target" },
    h("section", { class: "tp207-metric" }, h("span", { text: "Owner-reported opening balance" }), h("strong", { text: "0g" }), h("small", { text: "Reported 28 October 2026. A dated owner statement, not a live bank feed.", "data-owner-balance207": "0" })),
    h("section", { class: "tp207-metric" }, h("span", { text: "Spendable gold stretch objective" }), h("strong", { text: "1,000,000g" }), h("small", { text: "After costs and obligations, plus a separate 50,000g operating reserve." })),
    h("section", { class: "tp207-metric" }, h("span", { text: "Proposed operating horizon" }), h("strong", { text: "90 days" }), h("small", { text: "From a separately confirmed operational start. Demand and capacity remain unverified." }))));
  const summary = Array.isArray(TREASURY_PLAN207.summary) ? TREASURY_PLAN207.summary : TREASURY_PLAN207.summary ? [TREASURY_PLAN207.summary] : [];
  root.append(h("section", { class: "tp207-member-summary frame", "aria-labelledby": "tp207-members-heading" },
    h("h2", { id: "tp207-members-heading", text: "What this means for members" }),
    h("p", { text: "Help through voluntary gold, requested materials, useful work or knowledge. Recognition should value each form of contribution." }),
    summary.length ? h("ul", null, summary.map(text => h("li", { text }))) : null,
    h("p", { class: "tp207-rule", text: "Membership and justice are independent of payment. No paid kicks, punishments, purchased authority or revenue targets for appeals. Existing Royal Writs, Treasury dispatch and other held features stay paused or OFF." }),
    h("div", { class: "tp207-links" }, h("a", { href: "#/community/workshop", text: "Explore the Guild Workshop" }), h("a", { href: "#/roles/treasurer", text: "Treasurer responsibilities" }), h("a", { href: "#/organization", text: "Current Council and officer structure" }))));

  const calcHeading = h("h2", { id: "tp207-calculator-title", text: "Test the economics before committing to targets" });
  const calc = h("section", { class: "tp207-calculator frame", id: "calculator", "aria-labelledby": "tp207-calculator-title" },
    h("p", { class: "tp207-eyebrow", text: "Interactive planning model" }), calcHeading,
    h("p", { text: "Every field below is an assumption. Changing it recalculates this page only: nothing is saved, sent, paid or changed in the guild bank." }),
    h("p", { class: "tp207-model-note", text: "The model uses 25%, 50% and 75% activity in weeks 1–3, then full activity for the remaining 69 days. Both revenue and other costs follow that ramp: 90 days equals 11.3571 mature weeks, not 13 full weeks. Fixed costs or a slower ramp would lower the result." }));
  const fields = h("div", { class: "tp207-fields" });
  for (const field of TREASURY_FIELDS207) {
    const id = "tp207-" + field.key;
    const error = h("span", { id: id + "-error", class: "tp207-field-error", hidden: true });
    const control = h("input", { id, name: field.key, type: "number", inputmode: field.integer ? "numeric" : "decimal", min: "0", max: String(field.max), step: field.integer ? "1" : "any", value: String(TREASURY_DEFAULTS207[field.key]), "aria-describedby": id + "-help " + id + "-error", oninput: () => update207() });
    controls.set(field.key, control); fieldErrors.set(field.key, error);
    fields.append(h("div", { class: "tp207-field" }, h("label", { for: id, text: field.label + " (" + field.unit + ")" }), control, h("small", { id: id + "-help", text: field.help }), error));
  }
  const status = h("p", { class: "tp207-calc-status", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  const results = h("div", { class: "tp207-results", id: "tp207-scenario-results", "aria-label": "Calculated scenario results" });
  const form = h("form", { novalidate: true, onsubmit: event => { event.preventDefault(); update207(); } }, fields,
    h("div", { class: "tp207-actions" }, h("button", { type: "button", class: "btn", text: "Reset planning assumptions", onclick: () => { for (const [key, control] of controls) control.value = String(TREASURY_DEFAULTS207[key]); update207("Default planning assumptions restored. "); } })), status);
  calc.append(form, results, h("p", { class: "small tp207-exclusions", text: "Count only reconciled, settled, spendable gold in one accessible treasury pool. Unpaid bills, deposits for unfinished work, restricted aid, loans, pledges and unsold inventory are not spendable cash. Subtract every obligation before relying on a result; a forecast is not an actual balance." }));
  root.append(calc);

  function update207(prefix = "") {
    const result = calculateTreasury207(Object.fromEntries([...controls].map(([key, input]) => [key, input.value])));
    for (const [key, input] of controls) {
      const message = result.errors?.[key];
      input.setAttribute("aria-invalid", message ? "true" : "false");
      fieldErrors.get(key).textContent = message || "";
      fieldErrors.get(key).hidden = !message;
    }
    clear(results);
    if (!result.ok) {
      status.textContent = "Forecast unavailable. Correct " + Object.keys(result.errors).length + " invalid planning field(s); no previous result is being presented as current.";
      results.append(h("p", { class: "tp207-rule", text: "Enter a value in every field within its stated range. Blank values are not treated as zero." }));
      return;
    }
    const gapText = gold207(Math.abs(result.goalGap)) + (result.goalGap < 0 ? " below" : " above") + " the 1,000,000g spendable objective";
    status.textContent = prefix + "Scenario: " + gold207(result.weeklyNet) + " net per mature week; " + gold207(result.spendableCash) + " after the reserve on Day 90. " + gapText + ".";
    const card = (title, value, text, key) => h("section", { class: "tp207-result", "data-result207": key }, h("h3", { text: title }), h("strong", { text: value }), h("p", { text }));
    results.append(h("div", { class: "tp207-result-grid" },
      card("Mature weekly net", gold207(result.weeklyNet), "After the modelled margins and other costs.", "weeklyNet"),
      card("Day 90 cash forecast", gold207(result.projectedCash), "Settled-cash assumption before reserving operating funds.", "projectedCash"),
      card("After operating reserve", gold207(result.spendableCash), result.spendableCash < 0 ? "A reserve shortfall, not available gold." : "Scenario cash less " + gold207(result.values.reserveGold) + " reserved.", "spendableCash"),
      card("Gap against stretch goal", (result.goalGap < 0 ? "−" : "+") + gold207(Math.abs(result.goalGap)), result.goalGap < 0 ? "The assumptions do not reach the goal." : "A modelled surplus; no promised outcome.", "goalGap")));
    if (result.negativeCash || result.reserveUnfunded) results.append(h("p", { class: "tp207-warning", text: result.negativeCash ? "Projected cash is negative. This scenario needs financing or lower spending; negative gold is a deficit, not a bank balance." : "The operating reserve is not fully funded. The shortfall cannot be treated as spendable gold." }));
    results.append(table207(["Mature-week component", "Treasury contribution"], [
      ["Voluntary donations · " + number207(result.donors) + " assumed donors", gold207(result.weeklyDonations)],
      ["Goods · after modelled direct costs and payouts", gold207(result.weeklyGoods)],
      ["Services · after modelled direct costs and payouts", gold207(result.weeklyServices)],
      ["Other costs · scaled with the activity ramp", "−" + gold207(result.values.weeklyCosts)],
      ["Net retained per mature week", gold207(result.weeklyNet)]
    ], "Scenario income bridge"));
    results.append(h("p", { class: "tp207-gift", "data-result207": "requiredWeeklyGift", text: result.requiredWeeklyGift === null ? "No finite per-donor gift can close this scenario's gap with zero assumed donors. Add a credible, voluntary revenue source or revise the target." : "To reach the goal with these other assumptions: " + gold207(result.requiredWeeklyGift) + " per assumed donor per mature week. This is a sensitivity calculation, never a required contribution." }));
    results.append(h("h3", { text: "Scenario trajectory · not actual progress" }),
      table207(["Checkpoint", "Cash after costs", "After full reserve"], result.milestones.map(point => ["Day " + point.day, gold207(point.cash), gold207(point.afterReserve)]), "Modelled 90-day cash checkpoints"));
    const bars = h("ol", { class: "tp207-bars", "aria-label": "Scenario cash relative to the target plus reserve" });
    const scale = Math.max(TREASURY_GOAL207 + result.values.reserveGold, ...result.milestones.map(point => point.cash), 1);
    for (const point of result.milestones) {
      const bar = h("span", { class: "tp207-bar-fill" });
      bar.style.width = Math.min(100, Math.max(0, point.cash / scale * 100)) + "%";
      bars.append(h("li", null, h("span", { text: "Day " + point.day }), h("span", { class: "tp207-bar-track", "aria-hidden": "true" }, bar), h("span", { text: gold207(point.cash) })));
    }
    results.append(bars, h("p", { class: "small", text: "Bars show non-negative scenario cash. The table retains all negative values. Goal cash includes the spendable target plus the additional reserve." }));
  }
  update207();

  const contents = h("nav", { class: "tp207-contents", "aria-label": "Treasury programme chapters" }, h("h2", { text: "The officer playbook" }), h("p", { text: "Read the whole plan, or open a chapter for the job you own." }));
  const links = h("div", { class: "tp207-chapter-links" });
  const body = h("div", { class: "tp207-chapters" });
  function renderSection207(section) {
    return h("section", { class: "tp207-chapter-section" }, section.heading ? h("h3", { text: section.heading }) : null,
      (section.paragraphs || []).map(text => h("p", { text })),
      section.bullets?.length ? h("ul", null, section.bullets.map(text => h("li", { text }))) : null,
      section.table ? table207(section.table.headers, section.table.rows, section.table.caption || section.heading || "Programme reference") : null,
      (section.links || []).length ? h("ul", { class: "tp207-source-links" }, section.links.map(link => h("li", null, h("a", { href: link.url, text: link.label })))) : null);
  }
  for (const chapter of TREASURY_PLAN207.chapters || []) {
    const id = "tp207-chapter-" + chapter.id;
    const details = h("details", { class: "tp207-chapter", id, "data-plan-chapter207": chapter.id }, h("summary", null, h("span", { text: chapter.title })),
      h("div", { class: "tp207-chapter-body" }, chapter.intro ? h("p", { class: "tp207-chapter-intro", text: chapter.intro }) : null, (chapter.sections || []).map(renderSection207)));
    const link = h("button", { type: "button", text: chapter.title, onclick: () => { details.open = true; details.scrollIntoView?.({ behavior: "auto", block: "start" }); } });
    chapters.push(details); links.append(link); body.append(details);
  }
  contents.append(links, h("div", { class: "tp207-actions" },
    h("button", { type: "button", class: "btn small", text: "Expand every chapter", onclick: () => { for (const chapter of chapters) chapter.open = true; } }),
    h("button", { type: "button", class: "btn small", text: "Collapse chapters", onclick: () => { for (const chapter of chapters) chapter.open = false; } }),
    h("button", { type: "button", class: "btn small", text: "Print the complete plan", onclick: () => globalThis.print?.() })));
  root.append(contents, body, h("footer", { class: "tp207-footer" }, h("p", { text: "Programme assumptions dated 28 October 2026. Publishing this playbook does not commence collections, approve budgets or activate paid offers. Existing officer authority, privacy safeguards and held-feature controls remain in force." })));
  let printState = null;
  function beforePrint207() { if (!printState) { printState = chapters.map(chapter => chapter.open); for (const chapter of chapters) chapter.open = true; } }
  function afterPrint207() { if (printState) { chapters.forEach((chapter, index) => { chapter.open = printState[index]; }); printState = null; } }
  globalThis.addEventListener?.("beforeprint", beforePrint207);
  globalThis.addEventListener?.("afterprint", afterPrint207);
  const requested = ui.parts?.[0];
  const selected = chapters.find(chapter => chapter.getAttribute("data-plan-chapter207") === requested);
  if (selected) { selected.open = true; selected.scrollIntoView?.({ behavior: "auto", block: "start" }); }
  return () => { globalThis.removeEventListener?.("beforeprint", beforePrint207); globalThis.removeEventListener?.("afterprint", afterPrint207); afterPrint207(); };
}

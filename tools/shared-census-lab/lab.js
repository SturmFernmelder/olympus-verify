/* Original synthetic census lab. Only fixed local fixtures reach the loopback service. */
(function () {
  "use strict";
  const byId = id => document.getElementById(id);
  const ui = Object.fromEntries(["status", "account", "identity-note", "refresh-button", "summary-rows", "summary-time", "reporter-note", "guild", "scenario", "scenario-note", "preview-button", "preview-panel", "preview-facts", "preview-deadline", "consent", "intent-button", "intent-note", "simulate-loss", "submit-button", "outcome-panel", "check-outcome", "receipts-list", "advance-301", "advance-901", "advance-86401", "reset-button"].map(id => [id, byId(id)]));
  const scenarioNotes = Object.freeze({ fresh: "A fresh synthetic observation with its original source time.", masked: "A fixture with small counts suppressed. Suppressed values are never reconstructed.", older: "A source old enough that its online count is unavailable. Receiving it does not renew its source time.", conflict: "A differing fixture can make this guild conflicted while an incompatible report remains current.", "invalid-future": "A deliberately future-dated fixture. The service should refuse it without accepting a report." });
  // A gateway error, unreadable response or server failure cannot establish
  // whether a write committed. Only the lab's bounded 4xx contract is definite.
  const serviceRefusals = new Set(["invalid_control_body", "unknown_synthetic_account", "synthetic_session_capacity", "synthetic_session_required", "synthetic_preview_required", "preview_expired", "original_synthetic_session_required", "json_content_type_required", "encoded_body_refused", "body_too_large", "request_aborted", "unknown_synthetic_scenario", "loopback_host_required", "invalid_local_path", "local_origin_required", "cross_site_refused", "query_refused", "method_refused", "csrf_required", "reporter_admission_required", "synthetic_preview_capacity", "current_consent_required", "synthetic_intent_capacity", "original_preview_required", "synthetic_clock_step_refused", "local_route_not_found", "body_bytes_required", "body_size", "invalid_utf8", "invalid_json", "invalid_unicode", "duplicate_key", "report_shape", "report_contract", "guild_scope", "report_time", "source_expired", "member_count", "small_total", "online_count", "small_complement", "online_expired", "context_required", "stale_context", "native_hold", "access_refused", "outcome_unavailable", "intent_contract", "intent_capacity", "attempt_limit", "intent_unavailable", "intent_reused", "intent_expired", "intent_binding", "accepted_interval", "content_expired"]);
  let state = null, preview = null, intent = null, unknown = null, busy = false;
  let requestController = null, generation = 0, expiryTimer = null, clock = null, summarySignature = null, receiptSignature = null;
  const startedHidden = document.hidden;
  let live = !startedHidden;

  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function status(message, kind = "") { ui.status.textContent = message; ui.status.className = "status" + (kind ? " " + kind : ""); }
  function integer(value) { return Number.isSafeInteger(value) && value >= 0; }
  function opaque(value) { return typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value); }
  function receiptId(value) { return value?.receiptId || value?.id; }
  function currentTime() { return clock ? clock.server + Math.max(0, Math.floor((performance.now() - clock.mono) / 1000)) : 0; }
  function when(value) { return integer(value) ? new Date(value * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" }) : "Unavailable"; }
  function count(value) { return value === "few" ? "Few (1–4)" : integer(value) ? value.toLocaleString() : "Unavailable"; }
  function sourceTime(row) { return integer(row.sourceReceivedAt) && integer(row.observedAt) ? Math.min(row.sourceReceivedAt, row.observedAt) : null; }
  function guildLabel(key) { return state?.contract.guilds.find(g => g.guildKey === key)?.label || "Registered synthetic guild"; }
  function isReporter() { return state?.identity.reporter === true && state?.contract.canReport === true; }
  function hasGuild() { return isReporter() && state.contract.allowedGuildKeys.includes(ui.guild.value); }
  function validPreview() { return !!preview && integer(preview.expiresAt) && preview.expiresAt > currentTime(); }
  function validIntent() { return !!intent && integer(intent.expiresAt) && intent.expiresAt > currentTime(); }
  function clearDraft() {
    preview = null; intent = null; ui.consent.checked = false; ui["simulate-loss"].checked = false;
    ui["preview-panel"].hidden = true; ui["preview-facts"].replaceChildren(); ui["preview-deadline"].textContent = "";
    ui["intent-note"].textContent = "Review and consent are required before preparing an intent.";
  }
  function stopTimer() { if (expiryTimer !== null) clearInterval(expiryTimer); expiryTimer = null; }
  function startTimer() { stopTimer(); if (live && state) expiryTimer = setInterval(tick, 1000); }
  function controls() {
    const ready = !!state && live && !busy;
    ui.account.disabled = !ready || !!unknown;
    // A first hidden load or failed initial GET has no state/CSRF token yet.
    // The read-only refresh must remain usable to establish that state.
    ui["refresh-button"].disabled = !live || busy;
    ui.guild.disabled = !ready || !isReporter() || !!unknown;
    ui.scenario.disabled = !ready || !hasGuild() || !!unknown;
    ui["preview-button"].disabled = !ready || !hasGuild() || !!unknown;
    ui.consent.disabled = !ready || !validPreview() || !!intent || !!unknown;
    ui["intent-button"].disabled = !ready || !validPreview() || !ui.consent.checked || !!intent || !!unknown;
    ui["simulate-loss"].disabled = !ready || !validIntent() || !!unknown;
    ui["submit-button"].disabled = !ready || !validPreview() || !validIntent() || !ui.consent.checked || !!unknown;
    ui["check-outcome"].disabled = !ready || !unknown;
    ui["outcome-panel"].hidden = !unknown;
    for (const seconds of [301, 901, 86401]) ui["advance-" + seconds].disabled = !ready || !!unknown;
    ui["reset-button"].disabled = !ready;
    for (const button of ui["receipts-list"].querySelectorAll("button")) button.disabled = !ready || !!unknown;
  }
  function checkState(value) {
    if (!value || value.syntheticOnly !== true || !integer(value.now) || value.summary?.audience !== "private" || value.summary?.coverageComplete !== false || !integer(value.summary?.evaluatedAt) || typeof value.csrfToken !== "string" || !value.csrfToken || !value.identity || !["reporter-a", "reporter-b", "reader"].includes(value.identity.id) || !Array.isArray(value.contract?.guilds) || !Array.isArray(value.contract?.allowedGuildKeys) || !Array.isArray(value.summary.rows) || !Array.isArray(value.receipts)) throw Error("The service did not return the private synthetic contract. No report was sent.");
    return value;
  }
  function applyState(value) {
    const next = checkState(value), oldIdentity = state?.identity.id;
    if (oldIdentity && oldIdentity !== next.identity.id) { clearDraft(); unknown = null; }
    state = next; clock = { server: state.now, mono: performance.now() };
    ui.account.value = state.identity.id;
    const chosen = ui.guild.value;
    ui.guild.replaceChildren(...state.contract.guilds.map(g => { const option = el("option", g.label); option.value = g.guildKey; option.disabled = !state.contract.allowedGuildKeys.includes(g.guildKey); return option; }));
    const allowed = state.contract.guilds.find(g => state.contract.allowedGuildKeys.includes(g.guildKey));
    if (state.contract.allowedGuildKeys.includes(chosen)) ui.guild.value = chosen;
    else if (allowed) ui.guild.value = allowed.guildKey;
    else ui.guild.value = "";
    ui["identity-note"].textContent = isReporter() ? state.identity.label + " can submit only for its allowed synthetic guilds. Account ownership is private and separate from game identity." : state.identity.label + " can inspect the private synthetic projection. Reporting is not permitted for this account.";
    ui["reporter-note"].textContent = isReporter() ? "Choose a preset observation. Nothing is captured from a game, camera or file." : "Reader mode: the reporting controls are unavailable. Switch to a synthetic reporter to try the consent workflow.";
    renderSummary(); renderReceipts(); controls(); startTimer();
  }
  function renderSummary() {
    if (!state) return;
    const now = currentTime();
    const signature = JSON.stringify([state.summary, state.summary.rows.map(row => [integer(row.expiresAt) && now >= row.expiresAt, sourceTime(row) === null || now - sourceTime(row) > 900])]);
    if (signature === summarySignature) return;
    summarySignature = signature;
    const cards = state.summary.rows.map(row => {
      const original = sourceTime(row);
      const expired = !integer(row.expiresAt) || now >= row.expiresAt || original === null || now - original > 86400;
      const rowState = ["reported", "conflicted", "unavailable"].includes(row.state) ? row.state : "unavailable";
      // Conflict DTOs deliberately redact source times and counts. Their lack
      // of a source time must not turn a conflict into a missing report.
      const effective = rowState === "conflicted" ? integer(row.expiresAt) && now >= row.expiresAt ? "unavailable" : "conflicted" : rowState === "reported" && expired ? "unavailable" : rowState;
      const card = el("article", undefined, "guild-card " + effective); card.dataset.guildKey = row.guildKey;
      const head = el("div", undefined, "guild-card-head"), title = el("div");
      title.append(el("h3", row.label || guildLabel(row.guildKey)));
      title.append(el("p", [row.product, row.realmGroup, row.faction].filter(v => typeof v === "string" && v).join(" · "), "guild-scope"));
      head.append(title, el("span", effective === "reported" ? "Reported" : effective === "conflicted" ? "Conflicted" : "Unavailable", "state-label " + effective)); card.append(head);
      if (effective === "reported") {
        const grid = el("dl", undefined, "count-grid"), onlineAllowed = now - original <= 900;
        for (const [label, value] of [["Reported characters", row.reportedCharacters], ["Reported online", onlineAllowed ? row.reportedOnline : null]]) {
          const cell = el("div", undefined, "count-cell"); cell.append(el("dt", label), el("dd", count(value), value === null || value === undefined ? "missing" : "")); grid.append(cell);
        }
        card.append(grid, el("p", "Observed " + when(row.observedAt) + " · Expires " + when(row.expiresAt), "guild-footnote"));
        if (!onlineAllowed) card.append(el("p", "Online is unavailable: the original source is over 15 minutes old.", "guild-footnote"));
      } else card.append(el("p", effective === "conflicted" ? "Conflicted at the last evaluation. Counts are withheld; refresh to check the current state." : expired && rowState === "reported" ? "This observation has expired. Its counts are no longer shown." : "No usable observation. This does not mean zero members.", "guild-footnote"));
      return card;
    });
    ui["summary-rows"].replaceChildren(...(cards.length ? cards : [el("p", "No registered synthetic guilds are available.", "empty")]));
    ui["summary-time"].textContent = "Private projection evaluated " + when(state.summary.evaluatedAt) + ". Expiry continues while this page is open; refreshing does not renew an observation.";
  }
  function receiptState(receipt) { return receipt.state === "accepted" && integer(receipt.expiresAt) && currentTime() >= receipt.expiresAt ? "expired" : receipt.state; }
  function renderReceipts() {
    if (!state) return;
    const signature = JSON.stringify([state.receipts, state.receipts.map(receiptState)]);
    if (signature === receiptSignature) return;
    receiptSignature = signature;
    const rows = state.receipts.map(receipt => {
      const section = el("article", undefined, "receipt"), copy = el("div"), name = el("h3", guildLabel(receipt.guildKey)), label = receiptState(receipt);
      name.append(" ", el("span", ["accepted", "withdrawn", "superseded", "expired"].includes(label) ? label : "Unavailable", "badge subtle"));
      copy.append(name, el("p", "Received " + when(receipt.receivedAt) + " · Expires " + when(receipt.expiresAt)));
      const ownId = receiptId(receipt);
      if (opaque(ownId)) copy.append(el("p", "Receipt " + ownId, "receipt-id"));
      section.append(copy);
      if (label === "accepted" && opaque(ownId)) {
        const button = el("button", "Withdraw my receipt", "secondary"); button.type = "button"; button.dataset.receiptId = ownId; button.setAttribute("aria-label", "Withdraw my receipt for " + guildLabel(receipt.guildKey));
        button.addEventListener("click", () => withdraw(ownId)); section.append(button);
      }
      section.append(el("p", "Source verified: " + (receipt.sourceVerified === false ? "no" : "unavailable") + " · Membership proved: " + (receipt.membershipProof === false ? "no" : "unavailable") + " · Game identity proved: " + (receipt.gameIdentityProven === false ? "no" : "unavailable"), "receipt-trust"));
      return section;
    });
    ui["receipts-list"].replaceChildren(...(rows.length ? rows : [el("p", "No receipts for this synthetic account. Another account's receipts are not shown here.", "empty")]));
  }
  function renderPreview() {
    if (!preview) return;
    const observation = preview.observation;
    ui["preview-facts"].replaceChildren();
    for (const [label, value] of [["Registered guild", guildLabel(observation.guildKey)], ["Reported characters", count(observation.reportedCharacters)], ["Reported online", count(observation.reportedOnline)], ["Observed", when(observation.observedAt)], ["Source received", when(observation.sourceReceivedAt)], ["Captured", when(observation.capturedAt)], ["Addon version", observation.addonVersion], ["Origin / membership proof", "Unverified / not proved"]]) ui["preview-facts"].append(el("dt", label), el("dd", value));
    ui["preview-panel"].hidden = false;
    ui["preview-deadline"].textContent = "Preview expires " + when(preview.expiresAt) + ". Preparing an intent does not refresh these source times.";
  }
  async function api(method, route, body) {
    if (!route.startsWith("/") || route.startsWith("//") || route.includes("\\")) throw Error("Only this local service can be used.");
    const headers = { Accept: "application/json" };
    if (method !== "GET") { if (!state?.csrfToken) throw Error("The synthetic session must be refreshed first."); headers["X-Census-CSRF"] = state.csrfToken; headers["Content-Type"] = "application/json"; }
    const ownGeneration = generation;
    const response = await fetch(route, { method, credentials: "same-origin", cache: "no-store", redirect: "error", headers, body: method === "GET" ? undefined : JSON.stringify(body ?? {}), signal: requestController?.signal });
    let value;
    try { value = await response.json(); }
    catch { const error = Error("The local response could not be read."); error.status = response.status; throw error; }
    if (ownGeneration !== generation || !live) throw Error("A suspended response cannot restore the view.");
    if (!response.ok) {
      const detail = value?.error;
      const recognized = response.status >= 400 && response.status < 500 && detail && !Array.isArray(detail) && Object.keys(detail).sort().join(",") === "code,message" && serviceRefusals.has(detail.code) && detail.message === "The synthetic request was refused: " + detail.code + ".";
      const error = Error(recognized ? "The synthetic request was refused: " + detail.code + "." : "The local operation could not be confirmed.");
      error.refused = !!recognized; error.status = response.status; throw error;
    }
    return value;
  }
  async function action(task, fallback = "The local request could not be confirmed. Refresh the view before continuing.") {
    if (busy || !live) return;
    busy = true; requestController = new AbortController(); const ownGeneration = ++generation; controls();
    try { await task(ownGeneration); }
    catch (error) { if (ownGeneration === generation && live) status(error.refused ? error.message : fallback, "error"); }
    finally { if (ownGeneration === generation) { busy = false; requestController = null; controls(); } }
  }
  async function refresh() { const next = await api("GET", "/__lab/state"); if (live) applyState(next); }
  async function preparePreview() {
    if (!hasGuild() || unknown) return;
    const guildKey = ui.guild.value, scenario = ui.scenario.value; clearDraft();
    await action(async () => {
      const result = await api("POST", "/__lab/preview", { guildKey, scenario });
      if (!live) return;
      if (!opaque(result.previewId) || !integer(result.expiresAt) || !result.observation || result.observation.guildKey !== guildKey) throw Error("Invalid fixture preview.");
      preview = result; renderPreview(); status("Synthetic fixture ready for local review. No report has been submitted.");
    });
  }
  async function prepareIntent() {
    if (!validPreview() || !ui.consent.checked || intent || unknown) return;
    const current = preview;
    await action(async () => {
      const result = await api("POST", "/api/community/shared-census/intents", { guildKey: current.observation.guildKey, previewId: current.previewId, consentVersion: state.contract.consentVersion });
      if (!live) return;
      if (!opaque(result.intent) || !integer(result.expiresAt)) throw Error("Invalid intent response.");
      intent = result; ui["intent-note"].textContent = "Original intent prepared. It expires " + when(result.expiresAt) + "; submission is a separate deliberate action.";
      status("Original intent prepared. Source times and consent have not been renewed.");
    }, "The intent response could not be confirmed. No report was sent. Refresh and review before proceeding.");
  }
  async function submit() {
    if (!validPreview() || !validIntent() || !ui.consent.checked || unknown) return;
    const original = { intent: intent.intent, previewId: preview.previewId, simulateLostResponse: ui["simulate-loss"].checked };
    unknown = { intent: original.intent, account: state.identity.id };
    await action(async () => {
      let result;
      try { result = await api("POST", "/api/community/shared-census/reports", original); }
      catch (error) { if (error.refused) { unknown = null; clearDraft(); } throw error; }
      if (!live) return;
      clearDraft();
      if (result.state === "unknown") { status("Submission outcome is unknown. Check the original intent; no automatic retry will run.", "neutral"); return; }
      if (!opaque(receiptId(result)) || !["accepted", "withdrawn", "superseded", "expired"].includes(result.state)) throw Error("Receipt was not confirmed.");
      unknown = null; await refresh(); status("Synthetic report received. This receipt does not verify its game source.");
    }, "The submission response was not confirmed. Check the original outcome; do not submit again.");
  }
  async function checkOutcome() {
    if (!unknown || unknown.account !== state?.identity.id) return;
    const original = unknown.intent;
    await action(async () => {
      const result = await api("GET", "/api/community/shared-census/intents/" + encodeURIComponent(original) + "/outcome");
      if (!live) return;
      if (["accepted", "withdrawn", "superseded", "expired"].includes(result.state) || result.receipt && opaque(receiptId(result.receipt))) {
        unknown = null; clearDraft(); await refresh(); status("The original outcome was checked. No replacement submission was made.");
      } else status("The original outcome remains " + (result.state === "unknown" ? "unknown" : "unconfirmed") + ". No retry or adoption is available.", "neutral");
    }, "The original outcome could not be read. It remains unknown; no retry was made.");
  }
  async function withdraw(id) {
    if (unknown || !state?.receipts.some(r => receiptId(r) === id && receiptState(r) === "accepted")) return;
    await action(async () => { await api("DELETE", "/api/community/shared-census/receipts/" + encodeURIComponent(id), {}); if (live) { await refresh(); status("Your synthetic receipt was withdrawn. Other accounts' independent receipts remain their own."); } }, "Withdrawal was not confirmed. Refresh your own receipt before considering another action.");
  }
  function tick() {
    if (!live || !state) return;
    if (preview && !validPreview()) { clearDraft(); status("The local preview expired. Its consent and prepared intent were cleared; source times were not refreshed.", "neutral"); }
    else if (intent && !validIntent()) { clearDraft(); status("The original intent expired. Review a new fixture deliberately; the expired intent cannot be adopted.", "neutral"); }
    renderSummary(); renderReceipts(); controls();
  }
  ui["preview-button"].addEventListener("click", preparePreview);
  ui["intent-button"].addEventListener("click", prepareIntent);
  ui["submit-button"].addEventListener("click", submit);
  ui["check-outcome"].addEventListener("click", checkOutcome);
  ui.consent.addEventListener("change", controls);
  for (const id of ["guild", "scenario"]) ui[id].addEventListener("change", () => { clearDraft(); ui["scenario-note"].textContent = scenarioNotes[ui.scenario.value]; controls(); });
  ui.account.addEventListener("change", () => {
    if (unknown) { ui.account.value = state.identity.id; return; }
    const account = ui.account.value; clearDraft();
    action(async () => { const next = await api("POST", "/__lab/session", { account }); if (live) { applyState(next); status("Selected a synthetic account. No production login or permissions changed."); } });
  });
  ui["refresh-button"].addEventListener("click", () => action(async () => { await refresh(); status(unknown ? "View refreshed. The original submission outcome still needs to be checked." : "View refreshed. Original observation and expiry times are unchanged.", unknown ? "neutral" : ""); }));
  for (const seconds of [301, 901, 86401]) ui["advance-" + seconds].addEventListener("click", () => action(async () => { const next = await api("POST", "/__lab/advance", { seconds }); if (live) { applyState(next); tick(); status("Advanced only the synthetic lab clock by " + seconds.toLocaleString() + " seconds. Production and your system clock are unchanged.", "neutral"); } }));
  ui["reset-button"].addEventListener("click", () => action(async () => { const next = await api("POST", "/__lab/reset", {}); if (live) { clearDraft(); unknown = null; applyState(next); status("Synthetic memory reset. No real data was collected or removed."); } }));
  function suspend() {
    live = false; ++generation; requestController?.abort(); requestController = null; busy = false; stopTimer(); clearDraft();
    ui["summary-rows"].replaceChildren(el("p", "View paused while hidden. Refresh the synthetic state before relying on its counts.", "empty"));
    ui["receipts-list"].replaceChildren(el("p", "Private receipts are hidden while the page is paused.", "empty")); controls();
    summarySignature = null; receiptSignature = null;
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) suspend();
    else { live = true; controls(); status(unknown ? "Page resumed with an unknown submission outcome. Check only the original intent." : "Page resumed. Preview and consent were cleared. Refresh the view to read current synthetic state.", "neutral"); }
  });
  window.addEventListener("pagehide", suspend);
  window.addEventListener("pageshow", event => { if (event.persisted && !document.hidden) { live = true; controls(); status("Page restored. Refresh to read current synthetic state; preview and consent remain cleared.", "neutral"); } });
  if (live) action(async () => { await refresh(); status("Local synthetic lab ready. All observations below are fixtures; no production feature is activated."); });
  else { status("Page is paused. Return to the page and refresh the synthetic state.", "neutral"); controls(); }
})();

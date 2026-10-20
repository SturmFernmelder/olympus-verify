/* Website-mounted local census preview. Fixed synthetic endpoints only; no production activation. */
(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OlympusSharedCensusLocal = api;
})(typeof window === "object" ? window : globalThis, function (root) {
  "use strict";
  const mounted = new WeakMap();
  let instance = 0;
  const markup = [
  [
    "div",
    {
      "class": "lab-banner"
    },
    [
      [
        "strong",
        {},
        [
          "Synthetic data"
        ]
      ],
      [
        "span",
        {
          "aria-hidden": "true"
        },
        [
          "·"
        ]
      ],
      [
        "strong",
        {},
        [
          "Local only"
        ]
      ],
      [
        "span",
        {},
        [
          "No real guild or account data"
        ]
      ]
    ]
  ],
  [
    "section",
    {
      "class": "intro",
      "aria-labelledby": "page-title"
    },
    [
      [
        "p",
        {
          "class": "eyebrow"
        },
        [
          "Community census · synthetic workflow"
        ]
      ],
      [
        "h2",
        {
          "id": "page-title",
          "class": "view-title"
        },
        [
          "Shared census · local preview"
        ]
      ],
      [
        "p",
        {},
        [
          "Try the proposed reporting and withdrawal flow using preset fixtures. These are unverified volunteer claims, never checked guild membership, unique people or live population figures."
        ]
      ]
    ]
  ],
  [
    "div",
    {
      "id": "status",
      "class": "status",
      "role": "status",
      "aria-live": "polite"
    },
    [
      "Connecting to the local synthetic lab…"
    ]
  ],
  [
    "section",
    {
      "class": "session-strip",
      "aria-label": "Synthetic session"
    },
    [
      [
        "div",
        {},
        [
          [
            "label",
            {
              "for": "account"
            },
            [
              "Synthetic account"
            ]
          ],
          [
            "select",
            {
              "id": "account",
              "data-testid": "account",
              "disabled": ""
            },
            [
              [
                "option",
                {
                  "value": "reporter-a"
                },
                [
                  "Reporter A"
                ]
              ],
              [
                "option",
                {
                  "value": "reporter-b"
                },
                [
                  "Reporter B"
                ]
              ],
              [
                "option",
                {
                  "value": "reader"
                },
                [
                  "Reader only"
                ]
              ]
            ]
          ]
        ]
      ],
      [
        "p",
        {
          "id": "identity-note"
        },
        [
          "No production login is used."
        ]
      ],
      [
        "button",
        {
          "id": "refresh-button",
          "type": "button",
          "class": "secondary",
          "disabled": ""
        },
        [
          "Refresh view"
        ]
      ]
    ]
  ],
  [
    "div",
    {
      "class": "workspace"
    },
    [
      [
        "section",
        {
          "class": "panel overview",
          "aria-labelledby": "summary-title"
        },
        [
          [
            "div",
            {
              "class": "section-heading"
            },
            [
              [
                "div",
                {},
                [
                  [
                    "p",
                    {
                      "class": "eyebrow"
                    },
                    [
                      "Private reader projection"
                    ]
                  ],
                  [
                    "h2",
                    {
                      "id": "summary-title"
                    },
                    [
                      "Guild snapshots"
                    ]
                  ]
                ]
              ],
              [
                "span",
                {
                  "class": "badge"
                },
                [
                  "Unverified"
                ]
              ]
            ]
          ],
          [
            "p",
            {
              "class": "section-copy"
            },
            [
              "Each registered guild stands alone. Missing reports are unknown; conflicting reports hide counts. There is no all-Olympus total."
            ]
          ],
          [
            "div",
            {
              "id": "summary-rows",
              "data-testid": "summary-rows",
              "class": "guild-list"
            },
            [
              [
                "p",
                {
                  "class": "empty"
                },
                [
                  "Waiting for the local state."
                ]
              ]
            ]
          ],
          [
            "p",
            {
              "id": "summary-time",
              "class": "fine-print"
            },
            []
          ],
          [
            "div",
            {
              "class": "coverage-note"
            },
            [
              [
                "span",
                {
                  "class": "note-mark",
                  "aria-hidden": "true"
                },
                [
                  "i"
                ]
              ],
              [
                "p",
                {},
                [
                  [
                    "strong",
                    {},
                    [
                      "Coverage is incomplete."
                    ]
                  ],
                  " A registered guild list describes this demonstration's scope. It does not prove every guild is represented. Characters are not unique people."
                ]
              ]
            ]
          ]
        ]
      ],
      [
        "section",
        {
          "class": "panel report-panel",
          "aria-labelledby": "report-title"
        },
        [
          [
            "div",
            {
              "class": "section-heading"
            },
            [
              [
                "div",
                {},
                [
                  [
                    "p",
                    {
                      "class": "eyebrow"
                    },
                    [
                      "Synthetic reporter workflow"
                    ]
                  ],
                  [
                    "h2",
                    {
                      "id": "report-title"
                    },
                    [
                      "Review a fixture"
                    ]
                  ]
                ]
              ],
              [
                "span",
                {
                  "class": "step-marker",
                  "aria-hidden": "true"
                },
                [
                  "01—03"
                ]
              ]
            ]
          ],
          [
            "p",
            {
              "id": "reporter-note",
              "class": "section-copy"
            },
            [
              "Choose a preset observation. Nothing is captured from a game, camera or file."
            ]
          ],
          [
            "div",
            {
              "class": "field"
            },
            [
              [
                "label",
                {
                  "for": "guild"
                },
                [
                  "Registered synthetic guild"
                ]
              ],
              [
                "select",
                {
                  "id": "guild",
                  "data-testid": "guild",
                  "disabled": ""
                },
                [
                  [
                    "option",
                    {
                      "value": ""
                    },
                    [
                      "Waiting for registry"
                    ]
                  ]
                ]
              ]
            ]
          ],
          [
            "div",
            {
              "class": "field"
            },
            [
              [
                "label",
                {
                  "for": "scenario"
                },
                [
                  "Fixture scenario"
                ]
              ],
              [
                "select",
                {
                  "id": "scenario",
                  "data-testid": "scenario",
                  "disabled": ""
                },
                [
                  [
                    "option",
                    {
                      "value": "fresh"
                    },
                    [
                      "Fresh report"
                    ]
                  ],
                  [
                    "option",
                    {
                      "value": "masked"
                    },
                    [
                      "Small counts masked"
                    ]
                  ],
                  [
                    "option",
                    {
                      "value": "older"
                    },
                    [
                      "Older source"
                    ]
                  ],
                  [
                    "option",
                    {
                      "value": "conflict"
                    },
                    [
                      "Conflicting observation"
                    ]
                  ],
                  [
                    "option",
                    {
                      "value": "invalid-future"
                    },
                    [
                      "Invalid future timestamp"
                    ]
                  ]
                ]
              ],
              [
                "p",
                {
                  "id": "scenario-note",
                  "class": "field-note"
                },
                [
                  "A fresh synthetic observation with its original source time."
                ]
              ]
            ]
          ],
          [
            "button",
            {
              "id": "preview-button",
              "data-testid": "preview-button",
              "type": "button",
              "disabled": ""
            },
            [
              "1. Preview fixture"
            ]
          ],
          [
            "section",
            {
              "id": "preview-panel",
              "data-testid": "preview-panel",
              "class": "preview-panel",
              "aria-labelledby": "preview-title",
              "hidden": ""
            },
            [
              [
                "div",
                {
                  "class": "preview-heading"
                },
                [
                  [
                    "h3",
                    {
                      "id": "preview-title"
                    },
                    [
                      "Local review"
                    ]
                  ],
                  [
                    "span",
                    {
                      "class": "badge subtle"
                    },
                    [
                      "Synthetic"
                    ]
                  ]
                ]
              ],
              [
                "dl",
                {
                  "id": "preview-facts",
                  "class": "facts"
                },
                []
              ],
              [
                "p",
                {
                  "id": "preview-deadline",
                  "class": "fine-print"
                },
                []
              ],
              [
                "p",
                {
                  "class": "trust-note"
                },
                [
                  "Game origin and membership are not proved. The source time is a claim; receiving it does not make it current."
                ]
              ]
            ]
          ],
          [
            "label",
            {
              "class": "check-row consent-row",
              "for": "consent"
            },
            [
              [
                "input",
                {
                  "id": "consent",
                  "data-testid": "consent",
                  "type": "checkbox",
                  "disabled": ""
                },
                []
              ],
              [
                "span",
                {},
                [
                  "I agree to associate this ",
                  [
                    "strong",
                    {},
                    [
                      "synthetic report"
                    ]
                  ],
                  " privately with the selected synthetic account for ownership and withdrawal. This is not anonymous, and it proves no game identity."
                ]
              ]
            ]
          ],
          [
            "button",
            {
              "id": "intent-button",
              "data-testid": "intent-button",
              "type": "button",
              "class": "secondary",
              "disabled": ""
            },
            [
              "2. Prepare original intent"
            ]
          ],
          [
            "p",
            {
              "id": "intent-note",
              "class": "field-note"
            },
            [
              "Review and consent are required before preparing an intent."
            ]
          ],
          [
            "div",
            {
              "class": "submit-area"
            },
            [
              [
                "label",
                {
                  "class": "check-row",
                  "for": "simulate-loss"
                },
                [
                  [
                    "input",
                    {
                      "id": "simulate-loss",
                      "type": "checkbox",
                      "disabled": ""
                    },
                    []
                  ],
                  [
                    "span",
                    {},
                    [
                      "Simulate a lost submission response"
                    ]
                  ]
                ]
              ],
              [
                "button",
                {
                  "id": "submit-button",
                  "data-testid": "submit-button",
                  "type": "button",
                  "disabled": ""
                },
                [
                  "3. Submit synthetic fixture"
                ]
              ]
            ]
          ],
          [
            "section",
            {
              "id": "outcome-panel",
              "class": "outcome-panel",
              "aria-labelledby": "outcome-title",
              "hidden": ""
            },
            [
              [
                "h3",
                {
                  "id": "outcome-title"
                },
                [
                  "Outcome unknown"
                ]
              ],
              [
                "p",
                {},
                [
                  "The response did not confirm the result. Check only this original intent; the lab will not retry, adopt or create a replacement report."
                ]
              ],
              [
                "button",
                {
                  "id": "check-outcome",
                  "data-testid": "check-outcome",
                  "type": "button",
                  "class": "secondary",
                  "disabled": ""
                },
                [
                  "Check original outcome"
                ]
              ]
            ]
          ]
        ]
      ]
    ]
  ],
  [
    "section",
    {
      "class": "panel receipt-panel",
      "aria-labelledby": "receipts-title"
    },
    [
      [
        "div",
        {
          "class": "section-heading"
        },
        [
          [
            "div",
            {},
            [
              [
                "p",
                {
                  "class": "eyebrow"
                },
                [
                  "Selected synthetic account only"
                ]
              ],
              [
                "h2",
                {
                  "id": "receipts-title"
                },
                [
                  "Your receipts"
                ]
              ]
            ]
          ],
          [
            "span",
            {
              "class": "badge subtle"
            },
            [
              "Private ownership"
            ]
          ]
        ]
      ],
      [
        "p",
        {
          "class": "section-copy"
        },
        [
          "A receipt confirms that this local service received a claim. It never certifies the claim. Withdrawing your receipt does not withdraw another account's independently owned contribution."
        ]
      ],
      [
        "div",
        {
          "id": "receipts-list",
          "data-testid": "receipts-list",
          "class": "receipt-list"
        },
        [
          [
            "p",
            {
              "class": "empty"
            },
            [
              "No receipts loaded."
            ]
          ]
        ]
      ]
    ]
  ],
  [
    "section",
    {
      "class": "lab-controls",
      "aria-labelledby": "controls-title"
    },
    [
      [
        "div",
        {},
        [
          [
            "h2",
            {
              "id": "controls-title"
            },
            [
              "Time and reset controls"
            ]
          ],
          [
            "p",
            {},
            [
              "Advance only the lab's synthetic clock to inspect expiry. Your system clock and production are unchanged."
            ]
          ]
        ]
      ],
      [
        "div",
        {
          "class": "control-buttons"
        },
        [
          [
            "button",
            {
              "id": "advance-301",
              "type": "button",
              "class": "secondary",
              "disabled": ""
            },
            [
              "+ 301 seconds"
            ]
          ],
          [
            "button",
            {
              "id": "advance-901",
              "type": "button",
              "class": "secondary",
              "disabled": ""
            },
            [
              "+ 901 seconds"
            ]
          ],
          [
            "button",
            {
              "id": "advance-86401",
              "type": "button",
              "class": "secondary",
              "disabled": ""
            },
            [
              "+ 24 hours, 1 second"
            ]
          ],
          [
            "button",
            {
              "id": "reset-button",
              "type": "button",
              "class": "quiet",
              "disabled": ""
            },
            [
              "Reset synthetic lab"
            ]
          ]
        ]
      ]
    ]
  ]
];
  function mount(host, options = {}) {
    if (!host || !host.ownerDocument || typeof host.querySelector !== "function" || typeof host.replaceChildren !== "function") throw Error("A census view host is required.");
    const document = host.ownerDocument, window = document.defaultView || root;
    if (options.syntheticOnly !== true || window.location?.hostname !== "127.0.0.1") throw Error("This census preview is restricted to an explicitly synthetic 127.0.0.1 website.");
    mounted.get(host)?.destroy();
    let dead = false;
    const listeners = [], receiptListeners = [], prefix = "shared-census-" + (++instance) + "-";
    function make(entry) {
      if (typeof entry === "string") return document.createTextNode(entry);
      const [tag, attributes, children] = entry, node = document.createElement(tag);
      for (const [key, value] of Object.entries(attributes)) {
        if (key === "id") { node.id = prefix + value; node.setAttribute("data-census-control", value); }
        else if (key === "for") node.setAttribute(key, prefix + value);
        else if (key === "aria-labelledby") node.setAttribute(key, value.split(" ").map(id => prefix + id).join(" "));
        else if (["hidden", "disabled"].includes(key)) { node[key] = true; node.setAttribute(key, ""); }
        else { node.setAttribute(key, value); if (key === "value") node.value = value; }
      }
      node.append(...children.map(make)); return node;
    }
    const view = document.createElement("section"); view.className = "shared-census-local"; view.setAttribute("aria-label", "Shared census local synthetic preview");
    view.append(...markup.map(make)); host.replaceChildren(view);
    const reportPanel = host.querySelector(".report-panel");
    reportPanel.insertBefore(make(["div", { class: "field" }, [["label", { for: "input-mode" }, ["Input mode"]], ["select", { id: "input-mode", disabled: "" }, [["option", { value: "fixture" }, ["Preset fixture"]], ["option", { value: "qr" }, ["Synthetic QR pilot"]]]], ["p", { class: "field-note" }, ["QR mode reads only this local server's fixed synthetic images. No camera, file or real-data input is available."]]]]), host.querySelector('[data-census-control="guild"]').parentNode);
    reportPanel.insertBefore(make(["section", { id: "qr-panel", class: "qr-panel", hidden: "", "aria-label": "Synthetic QR pilot" }, [
      ["div", { class: "qr-buttons" }, [["button", { id: "qr-scan-button", type: "button", disabled: "" }, ["Scan synthetic QR"]], ["button", { id: "qr-stop-button", type: "button", class: "secondary", disabled: "" }, ["Stop QR scan"]]]],
      ["p", { id: "qr-status", class: "field-note", role: "status", "aria-live": "polite" }, ["The original 30-second scan includes obtaining and decoding the preset. Decoding does not prepare consent or submit a report."]],
      ["canvas", { id: "qr-canvas", class: "qr-canvas", "aria-label": "Fixed synthetic QR image", role: "img", hidden: "" }, []],
      ["section", { id: "qr-review", class: "qr-review", hidden: "", "aria-label": "Decoded synthetic observation" }, [["h3", {}, ["Decoded observation"]], ["dl", { id: "qr-review-facts", class: "facts" }, []], ["p", { class: "trust-note" }, ["Synthetic transfer only. The checksum verifies matching bytes, not a game source, membership or unique people. Review must finish within the original scan handle; it never renews source times."]], ["button", { id: "qr-use-button", type: "button", class: "secondary", disabled: "" }, ["Use decoded observation"]]]]
    ]]), host.querySelector('[data-census-control="preview-button"]'));
    function listen(target, type, handler) { target.addEventListener(type, handler); listeners.push(() => target.removeEventListener(type, handler)); }
    function listenReceipt(target, type, handler) { target.addEventListener(type, handler); receiptListeners.push(() => target.removeEventListener(type, handler)); }
    function current() { if (dead || !live) return false; try { return typeof options.live !== "function" || options.live() === true; } catch { return false; } }
    function destroy() {
      if (dead) return;
      dead = true; live = false; ++generation; requestController?.abort(); requestController = null; busy = false; stopTimer();
      for (const pending of cancelRequests) pending.abort(); cancelRequests.clear();
      for (const dispose of listeners.splice(0)) dispose();
      for (const dispose of receiptListeners.splice(0)) dispose();
      clearDraft(); state = null; unknown = null; clock = null; summarySignature = null; receiptSignature = null;
      ui["summary-rows"].replaceChildren(); ui["receipts-list"].replaceChildren();
      ui["identity-note"].textContent = ""; ui["summary-time"].textContent = "";
      view.replaceChildren();
      if (mounted.get(host) === controller) { host.replaceChildren(); mounted.delete(host); }
    }
    const controller = { destroy, refresh() { return action(async () => { await refresh(); if (current()) status("View refreshed. Original observation and expiry times are unchanged."); }); } };
  const byId = id => host.querySelector('[data-census-control="' + id + '"]');
    const ui = Object.fromEntries(["status", "account", "identity-note", "refresh-button", "summary-rows", "summary-time", "reporter-note", "guild", "scenario", "scenario-note", "preview-button", "preview-panel", "preview-facts", "preview-deadline", "consent", "intent-button", "intent-note", "simulate-loss", "submit-button", "outcome-panel", "check-outcome", "receipts-list", "advance-301", "advance-901", "advance-86401", "reset-button", "input-mode", "qr-panel", "qr-scan-button", "qr-stop-button", "qr-status", "qr-canvas", "qr-review", "qr-review-facts", "qr-use-button"].map(id => [id, byId(id)]));
    const scenarioNotes = Object.freeze({ fresh: "A fresh synthetic observation with its original source time.", masked: "A fixture with small counts suppressed. Suppressed values are never reconstructed.", older: "A source old enough that its online count is unavailable. Receiving it does not renew its source time.", conflict: "A differing fixture can make this guild conflicted while an incompatible report remains current.", "invalid-future": "A deliberately future-dated fixture. The service should refuse it without accepting a report." });
    // A gateway error, unreadable response or server failure cannot establish
    // whether a write committed. Only the lab's bounded 4xx contract is definite.
    const serviceRefusals = new Set(["website_reader_required", "website_session_required", "website_session_changed", "invalid_control_body", "unknown_synthetic_account", "synthetic_session_capacity", "synthetic_session_required", "synthetic_preview_required", "preview_expired", "original_synthetic_session_required", "json_content_type_required", "encoded_body_refused", "body_too_large", "request_aborted", "unknown_synthetic_scenario", "loopback_host_required", "invalid_local_path", "local_origin_required", "cross_site_refused", "query_refused", "method_refused", "csrf_required", "reporter_admission_required", "synthetic_preview_capacity", "current_consent_required", "synthetic_intent_capacity", "original_preview_required", "synthetic_clock_step_refused", "local_route_not_found", "body_bytes_required", "body_size", "invalid_utf8", "invalid_json", "invalid_unicode", "duplicate_key", "report_shape", "report_contract", "guild_scope", "report_time", "source_expired", "member_count", "small_total", "online_count", "small_complement", "online_expired", "context_required", "stale_context", "native_hold", "access_refused", "outcome_unavailable", "intent_contract", "intent_capacity", "attempt_limit", "intent_unavailable", "intent_reused", "intent_expired", "intent_binding", "accepted_interval", "content_expired"]);
    let state = null, preview = null, intent = null, unknown = null, busy = false;
    let qr = null, qrSequence = 0;
    const cancelRequests = new Set();
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
    function clearDraft(preserveQr = false) {
      if (!preserveQr) clearQR();
      preview = null; intent = null; ui.consent.checked = false; ui["simulate-loss"].checked = false;
      ui["preview-panel"].hidden = true; ui["preview-facts"].replaceChildren(); ui["preview-deadline"].textContent = "";
      ui["intent-note"].textContent = "Review and consent are required before preparing an intent.";
    }
    function stopTimer() { if (expiryTimer !== null) clearInterval(expiryTimer); expiryTimer = null; }
    function startTimer() { stopTimer(); if (current() && state) expiryTimer = setInterval(tick, 1000); }
    function controls() {
      if (dead) return;
      const ready = !!state && current() && !busy;
      ui.account.disabled = !ready || !!unknown;
      // A first hidden load or failed initial GET has no state/CSRF token yet.
      // The read-only refresh must remain usable to establish that state.
      ui["refresh-button"].disabled = !current() || busy;
      ui.guild.disabled = !ready || !isReporter() || !!unknown;
      ui.scenario.disabled = !ready || !hasGuild() || !!unknown;
      ui["preview-button"].disabled = !ready || !hasGuild() || !!unknown;
      const qrMode = ui["input-mode"].value === "qr";
      ui["input-mode"].disabled = !ready || !!unknown;
      ui["preview-button"].hidden = qrMode; ui["qr-panel"].hidden = !qrMode;
      ui["qr-scan-button"].disabled = !ready || !hasGuild() || !!unknown || !!qr;
      ui["qr-stop-button"].disabled = !current() || !qr;
      ui["qr-use-button"].disabled = !ready || !qr?.decoded || !qrValid(qr);
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
      for (const dispose of receiptListeners.splice(0)) dispose();
      const rows = state.receipts.map(receipt => {
        const section = el("article", undefined, "receipt"), copy = el("div"), name = el("h3", guildLabel(receipt.guildKey)), label = receiptState(receipt);
        name.append(" ", el("span", ["accepted", "withdrawn", "superseded", "expired"].includes(label) ? label : "Unavailable", "badge subtle"));
        copy.append(name, el("p", "Received " + when(receipt.receivedAt) + " · Expires " + when(receipt.expiresAt)));
        const ownId = receiptId(receipt);
        if (opaque(ownId)) copy.append(el("p", "Receipt " + ownId, "receipt-id"));
        section.append(copy);
        if (label === "accepted" && opaque(ownId)) {
          const button = el("button", "Withdraw my receipt", "secondary"); button.type = "button"; button.dataset.receiptId = ownId; button.setAttribute("aria-label", "Withdraw my receipt for " + guildLabel(receipt.guildKey));
          listenReceipt(button, "click", () => withdraw(ownId)); section.append(button);
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
    function qrValid(session, wall = Date.now()) {
      if (!session || session !== qr || session.sequence !== qrSequence || !current()) return false;
      const mono = performance.now();
      return Number.isSafeInteger(wall) && wall >= session.lastWall && wall < session.wallDeadline && mono >= session.startedMono && mono < session.monoDeadline && (!session.expiresAt || currentTime() < session.expiresAt);
    }
    function checkQR(session) {
      const wall = Date.now();
      if (!qrValid(session, wall)) throw Error("The original synthetic QR scan has ended.");
      session.lastWall = wall; return session;
    }
    function releaseQrPixels(session) {
      if (session.pending) { session.pending.reject(Error("The synthetic QR decoder was stopped.")); session.pending = null; }
      if (session.worker) { session.worker.onmessage = null; session.worker.onerror = null; session.worker.terminate(); session.worker = null; }
      if (session.bitmap) { session.bitmap.close(); session.bitmap = null; }
      if (session.pixels) { try { session.pixels.fill(0); } catch {} session.pixels = null; }
      const canvas = ui["qr-canvas"], context = canvas.getContext("2d");
      if (context && canvas.width && canvas.height) context.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0; canvas.height = 0; canvas.hidden = true;
    }
    function cancelRemoteQr(qrId) {
      if (!opaque(qrId) || !current() || !state?.csrfToken) return;
      const controller = new AbortController(); cancelRequests.add(controller);
      // Best-effort deletion of this owned synthetic handle. Expiry is still
      // authoritative if cancellation cannot be confirmed; never retry it.
      fetch("/__lab/qr/cancel", { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", headers: { "Content-Type": "application/json", "X-Census-CSRF": state.csrfToken }, body: JSON.stringify({ qrId }), signal: controller.signal }).catch(() => {}).finally(() => cancelRequests.delete(controller));
    }
    function clearQR(options = {}) {
      const previous = qr; qr = null; ++qrSequence;
      if (!previous) return;
      if (options.abort !== false && (previous.running || previous.accepting)) { ++generation; requestController?.abort(); requestController = null; busy = false; }
      previous.imageController.abort();
      if (previous.watch !== null) clearInterval(previous.watch);
      previous.assembler?.clear(); previous.assembler = null; previous.decoded = null;
      releaseQrPixels(previous);
      ui["qr-review"].hidden = true; ui["qr-review-facts"].replaceChildren();
      ui["qr-status"].textContent = "Scan stopped. No decoded observation, consent or source time was retained.";
      if (options.notify !== false) cancelRemoteQr(previous.qrId);
    }
    function stopQR(message = "Synthetic QR scan stopped. No observation was accepted.") {
      clearQR(); clearDraft(true); controls();
      if (current()) status(message, "neutral");
    }
    async function qrImage(session, route) {
      checkQR(session);
      const response = await fetch(route, { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", headers: { Accept: "image/png" }, signal: session.imageController.signal });
      checkQR(session);
      if (!response.ok) {
        if ([401, 403].includes(response.status) && current() && typeof options.onRefused === "function") options.onRefused(response.status);
        throw Error("The owned synthetic image could not be read.");
      }
      const type = response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase(), length = Number(response.headers.get("Content-Length"));
      if (type !== "image/png" || !Number.isSafeInteger(length) || length < 12 || length > session.protocol.LIMITS.imageFileBytes) throw Error("The synthetic PNG is outside the bounded image contract.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      try {
        checkQR(session);
        if (bytes.length !== length || bytes.length > session.protocol.LIMITS.imageFileBytes) throw Error("The synthetic PNG length changed.");
        const header = bytes.slice(0, session.protocol.LIMITS.imageHeaderBytes);
        let dimensions;
        try { dimensions = session.protocol.inspectImageHeader(header, type, { fileBytes: bytes.length }); } finally { header.fill(0); }
        const scale = Math.min(1, session.protocol.LIMITS.decodedSide / dimensions.width, session.protocol.LIMITS.decodedSide / dimensions.height);
        const width = Math.max(1, Math.floor(dimensions.width * scale)), height = Math.max(1, Math.floor(dimensions.height * scale));
        const bitmap = await window.createImageBitmap(new window.Blob([bytes], { type }), { resizeWidth: width, resizeHeight: height, resizeQuality: "high" });
        if (!qrValid(session)) { bitmap.close(); throw Error("The synthetic image arrived after the scan ended."); }
        session.bitmap = bitmap; checkQR(session);
        if (bitmap.width !== width || bitmap.height !== height) throw Error("The image decoder did not honor its bounded dimensions.");
        return bitmap;
      } finally { bytes.fill(0); }
    }
    async function decodeQrImage(session, bitmap) {
      checkQR(session);
      if (!session.worker) {
        session.worker = new window.Worker("/__census-local/qr-decoder.js");
        session.worker.onmessage = event => {
          const value = event.data, pending = session.pending;
          if (!pending || !value || value.id !== pending.id || value.generation !== session.sequence) return;
          session.pending = null;
          if (!qrValid(session)) { pending.reject(Error("The synthetic QR result arrived after its scan.")); return; }
          if (value.type === "decoded" && (value.text === null || typeof value.text === "string")) pending.resolve(value.text);
          else pending.reject(Error("The synthetic QR decoder refused an image."));
        };
        session.worker.onerror = () => { if (session.pending) { session.pending.reject(Error("The synthetic QR decoder stopped.")); session.pending = null; } };
      }
      const canvas = ui["qr-canvas"], context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw Error("A bounded local canvas is unavailable.");
      canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.hidden = false;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height); context.clearRect(0, 0, canvas.width, canvas.height);
      session.pixels = image.data; const id = ++session.nextImage;
      return new Promise((resolve, reject) => {
        session.pending = { id, resolve, reject };
        try { session.worker.postMessage({ type: "decode", id, generation: session.sequence, width: image.width, height: image.height, buffer: image.data.buffer }, [image.data.buffer]); }
        catch { session.pending = null; image.data.fill(0); reject(Error("The bounded synthetic image could not be transferred.")); }
      });
    }
    async function startQR() {
      if (busy || !hasGuild() || unknown || ui["input-mode"].value !== "qr" || qr) return;
      clearDraft();
      const protocol = window.OlympusGuildQRProtocol;
      if (!protocol || typeof protocol.createAssembler !== "function" || typeof protocol.inspectImageHeader !== "function" || protocol.LIMITS.captureMs !== 30000 || protocol.LIMITS.reviewMs !== 900000 || typeof window.Worker !== "function" || typeof window.createImageBitmap !== "function" || !window.crypto?.subtle) { status("The unchanged local QR protocol and decoder are unavailable. No scan was started.", "error"); return; }
      const startedWall = Date.now(), startedMono = performance.now();
      if (!Number.isSafeInteger(startedWall) || startedWall < 0) { status("The local clock is unavailable. No scan was started.", "error"); return; }
      const session = { sequence: ++qrSequence, protocol, lastWall: startedWall, wallDeadline: startedWall + 30000, startedMono, monoDeadline: startedMono + 30000, imageController: new AbortController(), watch: null, worker: null, pending: null, bitmap: null, pixels: null, nextImage: 0, assembler: null, decoded: null, running: true, accepting: false, guildKey: ui.guild.value, scenario: ui.scenario.value };
      qr = session;
      session.watch = setInterval(() => { if (!qrValid(session)) stopQR("The original 30-second QR handle expired or its clock/route changed. No observation was accepted."); }, 100);
      await action(async () => {
        try {
          ui["qr-status"].textContent = "Obtaining the fixed synthetic PNG preset. The original 30-second deadline is already running.";
          const descriptor = await api("POST", "/__lab/qr/start", { guildKey: session.guildKey, scenario: session.scenario });
          checkQR(session);
          if (descriptor.syntheticOnly !== true || !opaque(descriptor.qrId) || !/^[0-9a-f]{32}$/.test(descriptor.nonce) || !integer(descriptor.expiresAt) || !Number.isInteger(descriptor.frameCount) || descriptor.frameCount < 1 || descriptor.frameCount > protocol.LIMITS.parts || !Array.isArray(descriptor.images) || descriptor.images.length !== descriptor.frameCount || descriptor.images.some((route, index) => route !== "/__lab/qr/" + descriptor.qrId + "/images/" + (index + 1)) || descriptor.payloadSHA256 !== undefined && !/^[0-9a-f]{64}$/.test(descriptor.payloadSHA256)) throw Error("The fixed synthetic QR descriptor was refused.");
          session.qrId = descriptor.qrId; session.nonce = descriptor.nonce; session.expiresAt = descriptor.expiresAt; session.expectedHash = descriptor.payloadSHA256;
          checkQR(session);
          session.assembler = protocol.createAssembler({ nonce: descriptor.nonce, clock: () => currentTime() * 1000 });
          for (let index = 0; index < descriptor.images.length; index++) {
            let bitmap;
            try {
              bitmap = await qrImage(session, descriptor.images[index]); checkQR(session);
              const text = await decodeQrImage(session, bitmap); checkQR(session);
              if (!text) throw Error("No OLCS1 frame was decoded.");
              const result = await session.assembler.add(text); checkQR(session);
              ui["qr-status"].textContent = "Decoded " + result.received + " of " + result.total + " matching synthetic QR parts.";
              if (result.status === "complete") {
                if (index + 1 !== descriptor.frameCount) throw Error("The complete payload did not match the fixed frame inventory.");
                const payload = result.payload, guild = payload.guilds[0], registered = state.contract.guilds.find(g => g.guildKey === session.guildKey);
                if (!registered || guild.name !== registered.label || payload.realmGroup !== registered.realmGroup || payload.faction !== registered.faction) throw Error("The decoded synthetic scope does not match the registered guild.");
                const bytes = new TextEncoder().encode(JSON.stringify(payload)); let digest;
                try { digest = new Uint8Array(await window.crypto.subtle.digest("SHA-256", bytes)); checkQR(session); session.payloadSHA256 = Array.from(digest, n => n.toString(16).padStart(2, "0")).join(""); } finally { bytes.fill(0); digest?.fill(0); }
                if (session.expectedHash && session.expectedHash !== session.payloadSHA256) throw Error("The decoded payload did not match the fixed preset.");
                session.decoded = payload; session.running = false; releaseQrPixels(session);
                ui["qr-review-facts"].replaceChildren();
                for (const [label, value] of [["Registered guild", registered.label], ["Reported characters", count(guild.reportedCharacters)], ["Reported online", count(guild.online)], ["Observed", when(payload.observedAt)], ["Source received", when(guild.receivedAt)], ["Transfer", result.total + " matching synthetic QR parts"]]) ui["qr-review-facts"].append(el("dt", label), el("dd", value));
                ui["qr-review"].hidden = false;
                ui["qr-status"].textContent = "All synthetic PNGs decoded through the unchanged QR worker and assembler. Use the decoded observation before " + when(session.expiresAt) + "; no consent, intent or report was created.";
                status("Synthetic QR decoded locally. Review it, then deliberately use the observation to continue."); return;
              }
            } finally { if (bitmap) bitmap.close(); session.bitmap = null; }
          }
          throw Error("The fixed synthetic QR set was incomplete.");
        } catch (error) { if (qr === session) { clearQR({ abort: false }); clearDraft(true); } throw error; }
      }, "The synthetic QR scan was refused or interrupted. No observation was accepted; no report was submitted.");
    }
    async function useDecodedQR() {
      const session = qr;
      if (busy || !session?.decoded || !qrValid(session) || unknown) return;
      session.accepting = true;
      await action(async () => {
        try {
          checkQR(session);
          const result = await api("POST", "/__lab/qr/accept", { qrId: session.qrId, nonce: session.nonce, payloadSHA256: session.payloadSHA256 });
          checkQR(session);
          const row = session.decoded.guilds[0], observation = result.observation;
          if (result.syntheticOnly !== true || !opaque(result.previewId) || !integer(result.expiresAt) || !observation || observation.guildKey !== session.guildKey || observation.observedAt !== session.decoded.observedAt || observation.sourceReceivedAt !== row.receivedAt || observation.reportedCharacters !== row.reportedCharacters || observation.reportedOnline !== row.online) throw Error("The owned decoded preview was not confirmed.");
          clearQR({ notify: false, abort: false }); clearDraft(true); preview = result; renderPreview();
          ui["qr-status"].textContent = "The decoded observation was handed to census review. Consent, intent and submission remain separate steps.";
          status("Decoded synthetic observation is ready for review. Fresh explicit consent is still required; no intent or report was created.");
        } catch (error) { if (qr === session) { clearQR({ abort: false }); clearDraft(true); } throw error; }
      }, "The owned decoded preview was not confirmed. No intent or report was submitted.");
    }
    async function api(method, route, body) {
      if (!current()) throw Error("The census route is no longer current.");
      if (!route.startsWith("/") || route.startsWith("//") || route.includes("\\")) throw Error("Only this local service can be used.");
      const headers = { Accept: "application/json" };
      if (method !== "GET") { if (!state?.csrfToken) throw Error("The synthetic session must be refreshed first."); headers["X-Census-CSRF"] = state.csrfToken; headers["Content-Type"] = "application/json"; }
      const ownGeneration = generation;
      const response = await fetch(route, { method, credentials: "same-origin", cache: "no-store", redirect: "error", headers, body: method === "GET" ? undefined : JSON.stringify(body ?? {}), signal: requestController?.signal });
      let value;
      try { value = await response.json(); }
      catch { const error = Error("The local response could not be read."); error.status = response.status; throw error; }
      if (ownGeneration !== generation || !current()) throw Error("A suspended response cannot restore the view.");
      if (!response.ok) {
        const detail = value?.error;
        const recognized = response.status >= 400 && response.status < 500 && detail && !Array.isArray(detail) && Object.keys(detail).sort().join(",") === "code,message" && serviceRefusals.has(detail.code) && detail.message === "The synthetic request was refused: " + detail.code + ".";
        const error = Error(recognized ? "The synthetic request was refused: " + detail.code + "." : "The local operation could not be confirmed.");
        error.refused = !!recognized; error.status = response.status;
        if ([401, 403].includes(response.status) && current() && typeof options.onRefused === "function") options.onRefused(response.status);
        throw error;
      }
      return value;
    }
    async function action(task, fallback = "The local request could not be confirmed. Refresh the view before continuing.") {
      if (busy || !current()) return;
      busy = true; requestController = new AbortController(); const ownGeneration = ++generation; controls();
      try { await task(ownGeneration); }
      catch (error) { if (ownGeneration === generation && current()) status(error.refused ? error.message : fallback, "error"); }
      finally { if (ownGeneration === generation) { busy = false; requestController = null; controls(); } }
    }
    async function refresh() { const next = await api("GET", "/__lab/state"); if (current()) applyState(next); }
    async function preparePreview() {
      if (!hasGuild() || unknown || ui["input-mode"].value !== "fixture") return;
      const guildKey = ui.guild.value, scenario = ui.scenario.value; clearDraft();
      await action(async () => {
        const result = await api("POST", "/__lab/preview", { guildKey, scenario });
        if (!current()) return;
        if (!opaque(result.previewId) || !integer(result.expiresAt) || !result.observation || result.observation.guildKey !== guildKey) throw Error("Invalid fixture preview.");
        preview = result; renderPreview(); status("Synthetic fixture ready for local review. No report has been submitted.");
      });
    }
    async function prepareIntent() {
      if (!validPreview() || !ui.consent.checked || intent || unknown) return;
      const reviewedPreview = preview;
      await action(async () => {
        const result = await api("POST", "/api/community/shared-census/intents", { guildKey: reviewedPreview.observation.guildKey, previewId: reviewedPreview.previewId, consentVersion: state.contract.consentVersion });
        if (!current()) return;
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
        if (!current()) return;
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
        if (!current()) return;
        if (["accepted", "withdrawn", "superseded", "expired"].includes(result.state) || result.receipt && opaque(receiptId(result.receipt))) {
          unknown = null; clearDraft(); await refresh(); status("The original outcome was checked. No replacement submission was made.");
        } else status("The original outcome remains " + (result.state === "unknown" ? "unknown" : "unconfirmed") + ". No retry or adoption is available.", "neutral");
      }, "The original outcome could not be read. It remains unknown; no retry was made.");
    }
    async function withdraw(id) {
      if (unknown || !state?.receipts.some(r => receiptId(r) === id && receiptState(r) === "accepted")) return;
      await action(async () => { await api("DELETE", "/api/community/shared-census/receipts/" + encodeURIComponent(id), {}); if (current()) { await refresh(); status("Your synthetic receipt was withdrawn. Other accounts' independent receipts remain their own."); } }, "Withdrawal was not confirmed. Refresh your own receipt before considering another action.");
    }
    function tick() {
      if (!current() || !state) return;
      if (preview && !validPreview()) { clearDraft(); status("The local preview expired. Its consent and prepared intent were cleared; source times were not refreshed.", "neutral"); }
      else if (intent && !validIntent()) { clearDraft(); status("The original intent expired. Review a new fixture deliberately; the expired intent cannot be adopted.", "neutral"); }
      renderSummary(); renderReceipts(); controls();
    }
    listen(ui["preview-button"], "click", preparePreview);
    listen(ui["input-mode"], "change", () => { clearDraft(); controls(); });
    listen(ui["qr-scan-button"], "click", startQR);
    listen(ui["qr-stop-button"], "click", () => stopQR());
    listen(ui["qr-use-button"], "click", useDecodedQR);
    listen(ui["intent-button"], "click", prepareIntent);
    listen(ui["submit-button"], "click", submit);
    listen(ui["check-outcome"], "click", checkOutcome);
    listen(ui.consent, "change", controls);
    for (const id of ["guild", "scenario"]) listen(ui[id], "change", () => { clearDraft(); ui["scenario-note"].textContent = scenarioNotes[ui.scenario.value]; controls(); });
    listen(ui.account, "change", () => {
      if (unknown) { ui.account.value = state.identity.id; return; }
      const account = ui.account.value; clearDraft();
      action(async () => { const next = await api("POST", "/__lab/session", { account }); if (current()) { applyState(next); status("Selected a synthetic account. No production login or permissions changed."); } });
    });
    listen(ui["refresh-button"], "click", () => action(async () => { await refresh(); status(unknown ? "View refreshed. The original submission outcome still needs to be checked." : "View refreshed. Original observation and expiry times are unchanged.", unknown ? "neutral" : ""); }));
    for (const seconds of [301, 901, 86401]) listen(ui["advance-" + seconds], "click", () => action(async () => { const next = await api("POST", "/__lab/advance", { seconds }); if (current()) { applyState(next); tick(); status("Advanced only the synthetic lab clock by " + seconds.toLocaleString() + " seconds. Production and your system clock are unchanged.", "neutral"); } }));
    listen(ui["reset-button"], "click", () => action(async () => { const next = await api("POST", "/__lab/reset", {}); if (current()) { clearDraft(); unknown = null; applyState(next); status("Synthetic memory reset. No real data was collected or removed."); } }));
    function suspend() {
      if (dead) return;
      live = false; ++generation; requestController?.abort(); requestController = null; busy = false; stopTimer(); clearDraft();
      ui["summary-rows"].replaceChildren(el("p", "View paused while hidden. Refresh the synthetic state before relying on its counts.", "empty"));
      ui["receipts-list"].replaceChildren(el("p", "Private receipts are hidden while the page is paused.", "empty")); controls();
      summarySignature = null; receiptSignature = null;
    }
    listen(document, "visibilitychange", () => {
      if (document.hidden) suspend();
      else if (!dead) { live = true; controls(); status(unknown ? "Page resumed with an unknown submission outcome. Check only the original intent." : "Page resumed. Preview and consent were cleared. Refresh the view to read current synthetic state.", "neutral"); }
    });
    listen(window, "pagehide", suspend);
    listen(window, "pageshow", event => { if (!dead && event.persisted && !document.hidden) { live = true; controls(); status("Page restored. Refresh to read current synthetic state; preview and consent remain cleared.", "neutral"); } });
    mounted.set(host, controller);
    controller.ready = current() ? action(async () => { await refresh(); status("Local synthetic lab ready. All observations below are fixtures; no production feature is activated."); }) : Promise.resolve();
    if (!current()) { status("Page is paused. Return to the page and refresh the synthetic state.", "neutral"); controls(); }
    return controller;
  }
  return Object.freeze({ mount });
});

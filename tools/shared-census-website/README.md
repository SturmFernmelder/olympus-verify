# Shared census inside the local website

This preview integrates the synthetic shared-census workflow into the **actual Olympus website shell**, at `#/community/shared-census`. It is a local development integration, not a production release. No production environment, settings, feature flags, secrets, provider API, upload service, game client, real identity, shared storage or activation is connected.

## Start and stop

Use the existing Node 24 and TypeScript dependency installation. From this checkout's root in PowerShell:

```powershell
$env:NODE_PATH = 'C:/path/to/existing/worker/node_modules'
$env:OLYMPUS_LUA_PYTHON = 'C:/path/to/existing/lupa-runtime/python.exe'
& 'C:/Program Files/nodejs/node.exe' tools/shared-census-website/serve.cjs --port 49384
```

Open the printed `http://127.0.0.1:49384/` URL, open **Community**, and choose **Shared census · local preview**. The same destination appears in the Community tabs and overview. The blue fixture toolbar can select a fictional member, administrator, unconfirmed, refused or signed-out website session. These controls are test identity issuers, not real authentication. A member fixture is selected on the first visit to `/`; use the explicit signed-out fixture to inspect the guest page.

The census has a second, explicitly fictional reporter/reader selector to exercise its narrower reporting permissions. It does not change the website identity. Preview a preset, review its claimed source times, explicitly consent to the synthetic reporter association, prepare an intent and deliberately submit to memory. The fixture-only adapter cannot accept an arbitrary report, file, pasted QR frames, capture or real guild data.

## Synthetic QR connection

Select **Synthetic QR pilot** as the observation input, choose a fictional guild and preset, and click **Scan synthetic QR**. The local server generates only that fixed synthetic observation, encodes the original `OLCS1` multipart protocol and renders real PNG QR images with the unchanged addon Lua QR encoder. The page reads those same-origin images through canvas, the unchanged isolated pilot decoder/jsQR worker and the original strict challenge/checksum assembler. Incomplete, mixed, stale or mismatched material cannot produce an accepted review.

After the complete decoded aggregate is visible, click **Use decoded observation**. This deliberately moves only the original server-owned fixture into the existing census preview. It creates no consent, intent, census report or receipt. Review the source times, explicitly consent, prepare an original intent and submit as separate actions. The server accepts an original opaque scan handle, nonce and exact canonical payload hash; it never accepts browser-supplied decoded JSON or counts. Matching a hash demonstrates transfer consistency, not genuine game origin or membership.

The original **30-second scan budget** begins before generation and includes requests, image decoding and the deliberate handoff. It uses both wall and monotonic time and never resets per frame. Decoded review remains within that same original scan budget, below the pilot's 15-minute review ceiling. Handoff retains the original source/capture times; the normal 300-second census preview and original hard source expiry still apply. Stop, source/fixture changes, account changes, hidden/page exit and route exit clear the owned decoder, canvas buffers, draft and consent. Becoming visible never resumes scanning automatically. Stopping a QR scan does not withdraw any previously submitted census receipt.

This connection intentionally has no file, paste, game/window or camera input. Capture permissions remain disabled. The separately frozen QR pilot and addon are unchanged and still have no production connection. No addon installation or real in-game action is needed for this synthetic demonstration. The existing trusted local Python/Lupa runtime renders PNGs in process memory; it runs only the hash-pinned pure Lua encoder, with no dependency installation or temporary image files.

The HTTP server binds only to IPv4 loopback. Do not expose it on LAN, through a tunnel, proxy, hosting service or production route. Mobile viewport tests run on the same computer; a physical phone cannot reach the PC's loopback address. Stop with `Ctrl+C`; process memory is discarded. No observation payloads or receipts are written to disk. Test evidence should contain only synthetic data and count-only service status, never cookie values.

## Integration boundary

`website-overlay.cjs` hash-pins the existing `worker/public/static/app.js`, then makes exact, count-guarded substitutions **in the served local copy only**. It adds real navigation, page title, Community tab, overview card and a route that uses the original Community reader guard. The production app file, Worker entry, BUILD, public assets, schema, wrangler files, policy, settings and flags remain byte-identical. This preview is not included in the Worker build or its public asset inventory.

The census is independent of the existing News and census-preview switches. It does not enable them or replace the old QR/private preview. Its only availability comes from running this explicit local preview process. A changed production app hash refuses startup until the local integration is deliberately reviewed; the tool never guesses a new insertion point or patches the source file.

The actual Worker, canonical test SQLite database and original test-cookie issuer come from the existing frontend fixture definitions. The broad frontend test body is not run. All seeded site identities, characters and roster data are fictional and stay in `:memory:`. The fixture uses its original local environment, not a production config. External provider transport throws; browser CSP allows only local resources. All original website writes, OAuth starts, sign-in and account operations are blocked by the outer server.

Every census state/API operation rechecks the actual Worker's current Community context. The member/admin reader must still have `communityRead` and `applicantWrite`; guest, unconfirmed and refused fixtures cannot bypass this by calling the API directly. Website and census sessions have independent HttpOnly/SameSite cookies. A census transport session is additionally bound to the original website preview session; changing the latter cannot adopt an old census receipt or intent. No real membership, identity or Native erasure qualification is implied by these fixture checks.

The existing census service is mounted as a same-origin callable handler, with no second listener or HTTP proxy. It retains exact Host/Origin, fetch-metadata, CSRF, closed body, ownership, original-intent, expiry and resource bounds. QR image reads and the handoff use the same current website and census-session fences. Fresh context and both original sessions are checked again after request-body receipt and after QR generation. Active handles and concurrent renderers are bounded; expired/cancelled images are cleared. It constructs reports only from immutable server-created fixtures. Counts/conflicts/masking/source deadlines and consent semantics remain those documented in [the lab](../shared-census-lab/README.md). `core.cjs` is unchanged.

The mounted view is scoped to its Community page. Route exit destroys its DOM, aborts owned requests, removes listeners/timers and prevents late replies from repopulating another route. Returning creates a fresh view; only the original transport may recover its own in-memory outcome. Hiding the page clears the displayed census and draft and leaves an explicit **Reopen local census** control. Becoming visible never automatically reads or restores data. Synthetic service receipts remain only in process memory. Browser lifecycle behavior is qualified only to the extent the evidence actually exercises it.

## Focused checks

With the same process-local `NODE_PATH`, run from this checkout:

```powershell
& 'C:/Program Files/nodejs/node.exe' tools/shared-census-website/tests/overlay.test.cjs
& 'C:/Program Files/nodejs/node.exe' tools/shared-census-website/tests/view.test.cjs
& 'C:/Program Files/nodejs/node.exe' tools/shared-census-website/tests/integration.test.cjs
& 'C:/Program Files/nodejs/node.exe' tools/shared-census-website/tests/qr-transport.test.cjs
& 'C:/Program Files/nodejs/node.exe' tools/shared-census-website/tests/qr-integration.test.cjs
```

These are bounded local checks, not the stopped 92-command aggregate, hosted CI, a deployment qualification, publisher authenticity, all-guild coverage or physical-device/camera acceptance. Production privacy registration, real reporter admission, D1 storage, upload contracts and any activation remain separately gated.

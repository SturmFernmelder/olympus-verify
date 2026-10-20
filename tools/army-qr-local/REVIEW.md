# Local Army QR: main review scope

## Base and retarget

This draft targets main at `12ae123ee727165752ed4cf08a12be2ebf14df9d`.
It contains the isolated Army QR preview and its local-only prerequisites:
the optional Stats Pilot addon, strict aggregate protocol/decoder, memory-only
census lab, attended bridge and served-copy website overlays. It does not include
the earlier unpublished talent, addon-promotion or production Army changes.

Both website overlays now pin main's exact app SHA256
`95bc0924fd11952536c8034790219cd5e8a63c2c8d20dbb86975e026450cb7cf`.
They add fixed-path local loaders and navigation to the served copy, preserving
main's original News and member-tool/talent functions. A changed source hash or
ambiguous seam refuses startup. No production frontend file is patched.

## Behavior and boundaries

- An explicit IPv4 loopback process adds **Community → Army · local QR preview**
  to a fictional member/admin website fixture. Every private operation checks
  the actual Worker's Community reader and applicant admission again.
- The original attended decoder accepts complete matching aggregate frames.
  Review, local ownership consent, original intent and submission remain
  separate actions. The original 30-second handoff, source times, masking,
  completeness, clock and ownership checks remain in force.
- Close, hidden-page and route-exit cleanup stop capture and retain the hidden
  iframe until normal CSRF-protected cancellation settles. Failed/unknown
  acknowledgements prevent replacement transfers; reopening is deliberate.
  Route exit or hiding removes the embedded recovery UI. Settle its original
  operation before leaving; returning cannot recreate that UI. The paused page
  keeps Reopen disabled unless cleanup is acknowledged exactly as successful.
- Website writes, real login and external provider transport are disconnected.
  SQLite and census receipts stay in process memory. The addon has no
  SavedVariables and excludes names, notes and GUIDs from the aggregate.

All existing main files remain unchanged. There is no Worker release, BUILD
bump, schema migration, production asset/configuration change, feature
activation, upload service or deployment. The original required CI workflow and
status names remain unchanged. A separate path-filtered, read-only workflow runs
only the local prototype's focused checks with fictional inputs.

## Qualification attribution

The main retarget is tested with synthetic inputs only. Its fresh focused checks
cover the pinned overlays, actual-Worker HTTP admission, frame lifecycle,
attended bridge/embedded service, original Lua-to-PNG-to-jsQR transport, strict
protocol and memory-only census. The new test defaults resolve dependencies
from the checkout or explicit environment variables, without workstation paths
or an extra PNG package. Desktop/mobile checks use the local website fixture;
they are not physical-device or phone-camera acceptance.

At the original main-retarget head `1816f21`, 18 focused Node leaves passed 607
checks; the offline Stats Pilot Lua leaf passed 188. The staged projection check
passed 1,157 consistency checks. A fresh
1440×1000 member and 390×844 admin browser smoke confirmed panel loading,
no outer/inner horizontal overflow, Close/route-exit cleanup and deliberate
reopening. No scan or observation submission was performed in that smoke.

The PR follow-up corrects the paused page's misleading Reopen state. A delayed
acknowledgement keeps it disabled; only exact success enables deliberate
reopening. Missing, false and rejected acknowledgements stay blocked, and stale
results cannot enable another route or identity. Fresh focused checks passed
54 overlay, 31 view/frame and 17 HTTP cases; the unchanged QR transport also
passed its 15 synthetic cases. The nine new overlay cases retain all 45 original
assertions. Desktop/mobile notice wrapping and ordinary cleanup were rechecked.
No recovery-after-exit guarantee or changed cancellation rule is claimed.

An earlier owner-operated real WoW-window transfer ran at
`cbf934eb03e8eee178be6463957a625caef7cfd4`, before this main retarget. It produced
one locally accepted receipt; that same receipt was inspected at desktop and
mobile viewport sizes, then withdrawn. Capture/review/native state was cleared
and the owned process stopped. This remains historical evidence, not a fresh
real capture on this draft. An earlier expired handoff remains failed evidence.
The local real-test receipt SHA256 is
`3fb1a37475fea6edc2f06ee826813ed19dc1bf095d6f5c0c3f1c8f18078433d0`.

Only source and fictional test fixtures belong in Git. Real observations,
screenshots, guild labels/counts, QR frames, receipt tokens, cookies and detailed
QA artifacts remain outside the repository. No real capture runs in CI.

## Reviewer commands

Use Node 24 and existing Worker dependencies through `NODE_PATH`. For synthetic
PNG rendering, use Python with Lupa 2.8, optionally selected through
`OLYMPUS_LUA_PYTHON`. The focused CI command list is in
`.github/workflows/local-army-qr.yml`; it includes the offline Stats Pilot Lua
guards and 18 local-tool Node leaves. No stopped Worker aggregate or review
runner is required. `tools/guild-qr-pilot/tests/lua-roundtrip.cjs` is a separate
manual oracle requiring externally generated fictional fixtures; it is not
claimed as part of this self-contained run.

Before pushing, run `node scripts/check-projections.cjs --index` and
`git diff --cached --check`. The copied upstream Apache licence has its original
terminal blank line; preserve those exact licence bytes. Check authored files
separately with
`git diff --cached --check -- . ':(exclude)tools/guild-qr-pilot/vendor/jsqr-1.4.0.LICENSE.txt'`.
Hosted results belong to the actual published head and remain separate from
local results.

## Remaining gates

This unsigned volunteer aggregate proves neither game origin, membership,
account association, unique people, complete guild coverage nor background
freshness. Production storage/privacy registration, real reporter admission,
upload contracts and activation need separate review and owner authorization.
Do not expose the preview through LAN, a tunnel or production hosting. Settings,
flags, Native E2, safeguards and launch gates are outside this change.

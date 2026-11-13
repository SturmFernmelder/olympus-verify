# Olympus 1.5.5 integration and Verify 0.6.28

## Current status (12 November 2026)

**Current author release: Olympus Guild 1.5.8** ([CurseForge project 1708200](https://www.curseforge.com/wow/addons/olympus-guild), by dnl_gentile). Per Codex's record of 12 November 2026, the 1.5.8 author release ZIP has the separate `OlympusSiteAggregate` folder, whose guild list includes `OLYMPUS PRIME`, and its `Olympus/Verify.lua` calls `OlympusVerifyBridge242.QueueSelf(code)` when the bridge reports self delivery. Both first appeared in 1.5.7 (11 November), so the two requests to Dan in the 1.5.5 record below are met upstream.

Verify has not qualified 1.5.7 or 1.5.8. No Lua check runs Dan's consumer against `OlympusVerifyBridge242.Status()`, and a module being present in the package is not acceptance of the bridge. Claude's Stage 1 audit (12 November) found that 1.5.7 takes census freshness from the roster-read time while its Bridge still exports the local receipt time, so Verify's census viewer can refuse a checkpoint whose report arrived late; Codex's review keeps that difference open. The sections after this one are the dated record of 10 November and describe 1.5.5.

Nothing in this integration is switched on by a release of Dan's addon:

| Off now | Before it is switched on | Who switches it |
|---|---|---|
| Website reporting (Army aggregate previews and publications): held unless `ARMY_SITE_AGGREGATE_ENABLED` is exactly `"true"`; the accepted configuration leaves it unset. | The owner verifies the dedicated exporter of the current release on a live Forever client, and publication passes its own gate ([Army publication](army-qr-publishing.md)). | The owner decides; Codex Root alone deploys the configuration that sets it. |
| The automatic five-minute aggregate relay (`site-feed-v1`): unmounted, with no route, cron, binding or credential. | The evidence in [the feed contract](launch227-feed-contract.md#required-evidence-before-mounting-or-enabling): the live native realm capture, a real masked sample, producer, replay, erasure and restore tests, registration of the dedicated public key, and one reconciled GM grace (48 hours agreed on 3 November; seven days in the 1.5.5 and 1.5.6 sources). | Mounting is a code change, reviewed and deployed by Codex Root with the owner's authorization. |
| Olympus Link (`/oly discord <code>`): off; nothing in `worker/wrangler.toml` sets `LINK_ENABLED`. | The preconditions of [the owner activation checklist](olympus-link.md#8-owner-activation-checklist-phase-2-not-part-of-186), a native `Player-…` GUID bound into the signed request, reviewed key enrollment, replay and revocation checks, and live client acceptance. | The owner runs the Phase 2 steps; agents only prepare the commands. |
| Code self-submission from Dan's "My Discord verification" entry (`QueueSelf`): not accepted. The contract is unchanged, and a queued code is a pending local request, never verification. | A Lua check of Dan's current consumer against `Status()`, and the owner resuming member-interaction acceptance, which stays owner-held. | The owner; Codex Root releases any code change it needs. |
| The local census viewer (`/olv census on`): off after every reload. | An officer turns it on for one session; it writes no SavedVariables and uploads nothing. | The officer at the keyboard. |

## Record of 10 November 2026 (Olympus 1.5.5)

The owner supplied Olympus-1.5.5.zip on 10 November 2026 and asked for working links/synchronization and an unsent message for Dan. The inspected archive is exactly the official v1.5.5 asset: 13,392,434 bytes, SHA256 `37f6dc0dbac0170d9ad1c597d84a09d6475e2231a6e5a9b0626ac35a4de65ad3`. All 430 installed Olympus files and both SiteAggregate files matched it before this change. Dan has also published v1.5.6; that release's additional peer-discovery behavior is not qualified by this 1.5.5 audit, and no upstream addon was replaced.

## Implemented connection

Olympus Verify declares OptionalDeps: Olympus. The Watcher reads persisted OlympusDB/OlympusRecordDB requests through the existing bounded, untrusted intake; a pending request, OLV242 transport, A626 collector delivery, Dan's GV guild approval and a current Discord role are distinct results. Original bodies, IDs, unknown outcomes, proofs and current server authority remain unchanged. Ordinary members do not need the officer's Watcher or private configuration.

The optional local census viewer now supports the actual public `OlympusBridge.GetCensusCheckpoint()` / CENSUS_CHECKPOINT_API_VERSION=1 contract. It maps character counts and per-guild receipt clocks into the existing unsigned community-observation schema. It validates declared server-clock availability separately and never substitutes server timestamps for local receipt timestamps. Fresh/count/retention rules stay 900/86400/604800 seconds. People/linked-alt estimates, seen-only/retained totals, identities and provenance never become membership evidence. A legacy getter, if present, retains its own refusal and masking; failure never falls through to another source.

Census is OFF after reload, requires explicit session opt-in and attended preview/export, writes no SavedVariables and sends no upload. The actual 1.5.5 Bridge source is executed under synthetic native APIs by the explicit `dan155_census --dan-archive` Lua check. It is outside the retired aggregate and uses no historical source hash oracle.

`OlympusVerifyBridge242.Status()` and `OlympusBridge.GetSection("verification")` now expose a bounded status projection. The generic Bridge API remains1; this section's version is243. Its envelope is `{version=243,deliveryOnly=true,membershipProof=false,roleAuthority=false,total,truncated,requests}`. At most20 newest visible requests contain only a domain-separated32hex display hash `id` of the admitted original ID (including legacy24hex Treasury IDs), allowlisted `type`, finite `requestedAt` and `deliveryState`. States are pending,delivered,rejected,unsupported_callback,unknown. A bare imported terminal status is unknown. Delivered/rejected require matched existing server ACK or accepted collector delivery evidence. This is historical/advisory delivery information, never current role authority. Original IDs/bodies are not rewritten. Codes, GUIDs, names, native proof/MAC, donation/receipt payloads and collector identity are excluded. The existing QueueSelf(code) boolean contract is unchanged.

In-game messages now point to Discord `/verify-status`, with `/olv status` for local delivery status. Dan's `/oly verify` is the separate guild/GM approval workflow. `/oly discord` loads a separately distributed Olympus_Link module, absent from this ZIP; these repairs do not activate that backend.

## Work that needs Dan or remains held

Dan's 1.5.5 contains no consumer of OlympusVerifyBridge242.QueueSelf/Status and no pendingRoleUpdates/OLV242/A626 implementation. A Dan-side UI can deliberately call QueueSelf(code) once for the current player and render Status delivery states when Verify is present. It must not label delivery as verified or retry an unknown original. The API returns a boolean, not a request handle; exact per-request UI correlation needs an explicitly agreed extension.

His SiteAggregate module supports only Olympus and Olympus I-X, excluding OLYMPUS PRIME. Our website parser already supports Prime, so the upstream allowlist needs a canonical Prime entry. Keep its current `olympus-site-aggregate` v1 schema and `1.3.2-site.1` producer contract unless a coordinated parser change is agreed. Its TOC product version1.5.5-site.1 does not replace that wire identifier.

The authenticated five-minute website aggregate relay remains unmounted/OFF. Dedicated public-key registration, current native realm mapping, real masked producer sample and producer/replay/erasure/restore evidence are still required. The earlier48-hour GM agreement differs from the seven-day grace shipped in1.5.5; reconcile the actual lifecycle before activation. No private key, signing seed or officer bearer should be sent to Dan. Aggregate counts do not supply branch membership proof.

Member fresh-code,nickname,attended rank-change,mail/trade/invite and cross-client interaction acceptance remains owner-held. Branch verification remains pending. Installed-file parity, Lua/Workerd checks and background roster/rank receipts are reported separately from those held native interactions. No message was sent to Dan.

# Shared community census: proposed contract

Draft, 20 October 2026. The owner authorized preparing this design before uploads or activation. This document proposes a future implementation; it creates no route, table, setting, flag, publisher connection, upload, retention job or reporting permission. Production settings, Native E2, safeguards and launch gates remain unchanged.

## Purpose and present boundary

Let a small number of volunteers report aggregate observations from their own guild through an attended addon-to-browser transfer. Everyone viewing the resulting website needs only a browser and the website's eventual read permission. A viewer needs no addon, companion or EXE. Reporters would opt in to a native in-game addon; a website login alone cannot read the game's roster.

The existing Army page presents the already-admitted Olympus I roster and site figures. Those checked records remain separate from volunteer observations. The delivered standalone pilot is a one-guild, local-memory preview with no upload or shared storage. Its `OLCS1` frames carry a browser challenge and transfer checksum; they establish neither game origin nor honest counts. This proposal does not make that pilot a publisher feed or authorize continuous capture.

The existing identity `OLG1`/`OLG2` formats, legacy unsigned census preview, guild-capacity evidence, account associations, role writers and Native E2 are separate contracts. Do not repurpose their parsers, acceptance, keys or permissions for shared statistics. No census result may grant membership, establish leadership, affect a queue, settle a role or open a launch entitlement.

## Decisions before implementation and activation

These decisions remain open and are not defaults inferred from this design:

1. **Audience:** public aggregates versus private Community readers. Until the owner explicitly chooses otherwise, design and any future implementation must default to private, admitted reads. Existing private roster, application and member data must never become public through a census response.
2. **Reporter admission:** which opted-in accounts and guilds may submit, who reviews the source registry and who can revoke reporting. Ordinary Discord membership or a self-asserted guild label is insufficient. Any selected account admission is an anti-abuse control, not proof that its report came from that guild or game client.
3. **Consent and policy:** visible reporter consent, permissible guild labels and distribution, privacy wording, the minimum account attribution needed for abuse handling, and subject-erasure behavior must be approved before collecting anything.
4. **Activation and operations:** a separately reviewed implementation, source/asset/policy pins, exact CI, owner rollout approval and live acceptance. This proposal does not add or enable a feature flag. It must not inherit activation merely because the older private census preview is configured.

## Proposed immutable versioned schema

Use the new JSON format `olympus-shared-census-observation-v1`. It is an HTTP submission DTO after deliberate local review, not a new identity QR protocol. The browser may interpret a validated local `OLCS1` snapshot and build this DTO only in a future separately approved implementation. Never forward arbitrary pasted legacy JSON, raw QR frames or a captured image to the server.

Each submission contains exactly these keys, with no additional properties at any level:

```json
{
  "format": "olympus-shared-census-observation-v1",
  "intent": "server-issued-opaque-id",
  "source": "unverified-volunteer-client",
  "sourceVerified": false,
  "membershipProof": false,
  "guildKey": "registry-issued-opaque-key",
  "addonVersion": "0.1.0",
  "observedAt": 1792497600,
  "sourceReceivedAt": 1792497600,
  "capturedAt": 1792497605,
  "completeRosterClaimed": true,
  "reportedCharacters": 100,
  "reportedOnline": 20
}
```

The example is synthetic and stores no actual observation. `intent` and `guildKey` are validated opaque identifiers issued by the future server; values shown above are explanatory placeholders, not valid credentials. The accepted addon version must be an exact reviewed version from an allowlist. Changing keys, types, masking, source scope or semantics requires a new format version and review, never permissive fallback.

Validation is all-or-nothing:

- Body at most 4 KiB of valid UTF-8 JSON, no duplicate keys, invalid Unicode, non-finite values or coercion. Reject unknown keys rather than silently discarding them. Only the named format, source and exact false trust flags are accepted.
- Exactly one registered own-guild source per submission. Resolve `guildKey` through a reviewed, server-owned registry containing its canonical display label, realm/product group and faction. A reporter cannot create, rename or reassign a registry entry through the report. Native observations matching an unregistered or ambiguous guild are refused until attended review; do not guess Roman numerals or normalize two distinct guilds together.
- Every time is an integer Unix second, never milliseconds. Require `0 <= sourceReceivedAt <= observedAt <= capturedAt`. At server receipt none may be more than 60 seconds in the future, a proposed refusal bound rather than a claimed clock offset. Require the source age to be at most 24 hours. A future implementation must test exact inclusive boundaries and refuse unknown or rolled-back local time.
- `completeRosterClaimed` must be `true`; incomplete or changing native rosters are refused in the addon before QR creation. This remains an unverified claim at the server. It cannot turn a self-reported count into a checked roster.
- `reportedCharacters` is the literal `"few"` for 1–4, or an integer from 5 through 1000. A member observing their own guild cannot report a valid zero-member guild. No guessed count represents a missing report.
- `reportedOnline` is `null`, the literal `"few"`, the integer 0, or an integer from 5 through the unmasked total. When the total is `"few"`, online must be `null`. If an exact online count would reveal a nonzero offline remainder of 1–4, online must be `null`. When the source is more than 900 seconds old at receipt, online must be `null`. Never unmask, subtract, estimate or sum suppressed cells.
- No character names, Discord IDs, GUIDs, rank labels, notes, account pointers, officer identity, zones, coordinates, chat, inventory, equipment, individual activity, raw device identifiers, SavedVariables, images or QR-frame text are accepted. Reporter authentication is separate transport context, not report content.

No class, level, profession or region breakdown is proposed in version 1. Adding those fields requires a separate privacy and complementary-suppression design. A collection of individually safe small cells can disclose a person through differencing.

## Proposed server receipt and freshness

The future server would assign each reporter's intent its own opaque receipt ID, trusted database `receivedAt`, immutable canonical submission digest, expiry and the fixed flags `sourceVerified:false`, `membershipProof:false`, `gameIdentityProven:false`. Receipt ownership, consent, recovery and withdrawal remain bound to that submitting account and original intent. Identical content from another account never returns or grants access to the first reporter's receipt. Unlike the account-free local pilot, a shared submission is privately associated with its authenticated site reporter for ownership, consent, abuse handling and erasure. Disclose that association before upload; it proves no game character or membership and never enters reader projections. Do not label this account-associated service unlinked or anonymous.

Keep claimed source times and trusted receipt time as distinct fields. Receipt authenticates when the server received the claim, not when a game observation happened. A content group's immutable hard expiry is the earliest of `sourceReceivedAt + 86400`, `observedAt + 86400` and its first trusted receipt time plus 86400. Each separately owned receipt expires no later than that original content deadline and its own `receivedAt + 86400`; every submitted claim is independently subject to these bounds. Re-reading, retrying, recapturing, cache refresh, duplicate submission or a second reporter cannot increase those source times or extend the content's original hard expiry. Retaining a later receipt cannot prolong the content after that deadline.

The reader evaluates age against the current server/database time:

| Source age | Reader behavior |
|---|---|
| Through 900 seconds | Show permitted size and online cells, explicitly “reported at” the original source time. |
| Over 900 seconds through 86400 seconds | Show permitted size only; online is unavailable. |
| Over 86400 seconds | Exclude the report from the current view, even if physical cleanup has not yet run. |
| Missing, future-dated, conflicting or invalid source | Show unavailable, never zero or a guessed current value. |

The server read contract must return an `evaluatedAt` and per-report `expiresAt`. A browser must hide expired cells when time passes; a hidden tab cannot silently keep an online-now claim. Polling the page does not create a new observation. No background screen capture or automatic addon request is proposed. A future new observation requires the reporter's deliberate interaction and a new bounded capture/consent attempt.

## Proposed endpoints: none implemented

Names below reserve a distinct design namespace only. No client should call them as part of this candidate.

| Proposed route | Purpose and admission |
|---|---|
| `GET /api/community/shared-census/contract` | Private admitted read of version, field limits and reviewed guild choices. No report collection. |
| `POST /api/community/shared-census/intents` | A separately admitted, opted-in reporter requests one short-lived intent after the visible local review. Five-minute lifetime; bound to original session, format and guild key. It cannot open a capture or grant another permission. |
| `POST /api/community/shared-census/reports` | One explicit upload of the closed DTO. Same-origin, original-session, Native/incarnation, standing and fresh reporter admission fences apply in the actual write batch. Consume the exact intent with its canonical digest and receipt atomically. |
| `GET /api/community/shared-census/receipts/{opaqueId}` | Original reporter's outcome recovery only, with current admission. Return the outcome of the original bytes; do not expose other reporters or permit adoption after an unknown result. IDs are opaque and not authorization. |
| `GET /api/community/shared-census/summary` | Private admitted aggregate projection until the audience decision is approved. No reporter identifiers or private checked roster/site fields. |
| `DELETE /api/community/shared-census/receipts/{opaqueId}` | Original reporter withdraws only their own contribution/consent, or separately authorized staff moderates the specified contribution under the corresponding current fence. It cannot delete another reporter's independently owned receipt or grant whole-guild deletion authority. |

All route names and permissions require implementation review. Existing application safeguards must be carried through the real transaction, not only checked before it. Unknown response outcomes persist as unknown and offer only checking the original outcome or retrying the exact bytes with the same intent. A changed body with a spent intent is refused. An expired intent cannot be adopted or converted into a new submission. No automatic retry-until-success.

## Abuse, deduplication and conflicts

The system cannot attest game origin. A malicious admitted reporter can fabricate counts, timestamps or a matching checksum. A QR checksum proves only consistent transfer; a browser challenge reduces accidental replay/mixing, not source forgery. More reporters agreeing does not establish independence, honest source or unique humans. Display “unverified volunteer report” throughout.

- Rate-limit the proposed write path per authenticated reporter and registry guild before expensive work; initial proposal is at most one accepted observation per reporter/guild every five minutes and at most 12 attempts per hour per reporter. Rejections consume an abuse budget. Exact limits need review against legitimate attendance and storage cost; limits never confer authenticity.
- Canonicalize the validated DTO with fixed field order and no whitespace ambiguity. The immutable per-intent submission digest includes that intent and its exact accepted bytes for outcome recovery. Separately deduplicate report content by registered guild, source times, masked counts and source version, excluding intent, reporter/account identity and capture/receipt times. Deduplication is a projection/storage optimization, not shared receipt ownership: every new admitted reporter intent has its own private receipt and consent record. A retry of the same intent returns only that intent's original outcome. A different account receives only its own receipt, never the first reporter's receipt or identity. Repeated identical content adds no votes, corroboration, freshness or retention time.
- Keep reports separate by registered guild/product/realm/faction. Do not merge same-name guilds, union characters, combine alternating snapshots or infer a player count. No cumulative all-Olympus total is proposed in version 1.
- If current reports for one guild disagree in their masked size or online values, mark the guild conflicted and withhold its current counts. Show only a generic conflict state and date range; do not expose the competing numbers or reporters. Never average, vote, choose the newest as truth, or let staff silently rewrite a report. Source-time changes do not erase conflict history while conflicting reports remain valid.
- An exact repeated report is not a fresh independent corroboration. A second account cannot renew the original source freshness or hard expiry. Withdrawing one receipt immediately excludes that reporter's contribution; it cannot delete another reporter's independently consented contribution. The content may remain projected only while another admitted, unwithdrawn, unexpired receipt exists, and only through the content's original hard expiry. With no eligible receipts, remove the count content from the projection and storage; a bounded count-free digest/deadline tombstone may preserve the original expiry so a later identical submission cannot extend it. Staff may exclude a specified contribution through an attributable moderation action; this cannot create checked source status or manufacture replacement values.
- Even non-conflicting reports can differ naturally over time. The conservative v1 conflict policy favors unavailable data over precision claims. Designing a narrower observation-window policy is a later reviewed change, not an undocumented exception.
- Do not publish arbitrary labels, error payloads, hashes of identities, precise submission activity or reporter counts. Labels come from the reviewed registry, text uses text nodes, and error logs contain only fixed categories/bounded statuses.

Suppression must be evaluated on the whole response and over repeated views. Do not reveal a masked total by a grand total, percentages, rank ordering, a complementary cell, per-reporter comparisons or a conflict display. Version 1 offers per-guild masked values only, no federation sum, trend history, online percentage or downloadable raw reports. No continuous online-presence tracking follows from the design.

## Proposed minimal retention and erasure

No data has been collected under this proposal. A future implementation should retain only the latest valid observation contribution per reporter/guild, for at most 24 hours from that receipt and never beyond the content's original hard expiry above. Shared content is retained only while at least one independently admitted, consented and unexpired receipt needs it; neither the last remaining receipt nor resubmission may extend its original deadline. No count payload remains once all eligible contributions are withdrawn or expired. Keep only the minimal count-free digest/original-deadline tombstone until that same deadline when needed to prevent expiry extension; it cannot expose a foreign receipt or restore withdrawn consent. Do not retain raw images, video, frame strings, pasted input, unmasked native rows or full HTTP bodies. No report archive or time-series history is proposed.

Expired intents and their consumed/digest outcome records expire after at most 24 hours from issue; they carry no count payload after report expiry. That finite tombstone prevents a spent original intent from becoming reusable. After expiry it is unknown/expired, never permission to upload again with that identifier. Future rate-limit and operation records must use the smallest bounded information needed and be registered for erasure before the first write.

Any account-associated submission, consent, moderation or abuse record must join the existing privacy registry and Native E2 erasure/holds, with its precise subject relation and writer fence. Aggregate guild counts must not be used as an account-linking index. Subject erasure must remove account-associated reports and outcome records without reviving old intents or replay rights; the design cannot assume that deleting a row proves deletion of provider backups or all physical copies. Backup, provider drain and all-copy qualifications remain separate and unchanged.

Cleanup may run late or fail. Read-time expiry still hides data. A future scheduled cleanup must be added to the real statement budget and bounded continuation model before deployment; this document adds no cron work. Consent withdrawal immediately excludes the subject's report projection and follows the reviewed retention/erasure path. Retained backups and operational logs require accurate disclosed limits, not an all-copies claim.

## Coverage and interface

List checked Olympus I figures separately from volunteer reports. Each volunteer row names its source category, guild scope, original observation date, age, expiry and unavailable/conflict state. Explicitly show that unreported guilds are unknown. A reviewed list of expected guilds, if later approved, is a directory of reporting scope rather than proof that it is complete or current.

No simultaneous all-Olympus online number, unique-player total, account membership proof, officer identity or guild capacity is derived. “No reports” never means zero guild members. The site can offer useful reported snapshots without promising all guild data or realtime updates. The source panel should link the publisher's normal addon page and explain that only volunteers need the in-game addon; ordinary readers install nothing.

## Source provenance and reuse

The owner's 20 October 2026 local census research supplied the source boundaries below. Its private research receipts remain local; this design does not require unpublished talent or production-frontend changes. Normal attributed links to [Olympus Guild on CurseForge](https://www.curseforge.com/wow/addons/olympus-guild) and [ONN's Army page](https://olympusnewsnetwork.com/army) are distinct from integration permission.

No reusable publisher census HTTP contract was verified in that research. Olympus Guild's supported public addon API excluded census data; software licensing is not consent to export or republish player data. ONN's inspected terms require written permission for census reuse/internal feeds, and the supplied Companion source is review-only. Do not scrape pages, use internal endpoints, redirect a publisher's uploads, copy proprietary Companion code or contact a publisher without separate authorization. A future supported aggregate feed needs actual current documentation, field/coverage/freshness/retention terms and permission before implementation.

The standalone pilot is original local code with an unchanged vendored jsQR decoder and retained notices. Any code or asset reused in a future implementation must retain its required notices and join source/publication coverage. This document grants no source or trademark license.

## Staged rollout and acceptance

1. **Design boundary:** owner reviews audience, admission, consent, schema, masking/conflicts and retention. Preparing this design authorizes no production backend, shared storage or activation. The later owner-authorized implementation remains an isolated loopback preview.
2. **Local pilot evidence:** preserve the existing 30-second scan, 15-second native request, 60-second addon snapshot and fixed preview lifetimes. A later owner-operated real WoW-window transfer reached the earlier local Army preview, with separate consent/intent/one submission, desktop/mobile responsive receipt checks and ordinary withdrawal. Earlier expired handoffs remain failed evidence. The main-compatible retarget requires its own focused source, transport and layout checks; historical real capture is not relabelled a fresh retarget capture. Exercise screen/camera capture only through normal explicit permission, verify Stop/hidden/source interruption/deadline track cleanup and test genuine hardware separately from desktop/mobile viewport layouts. The loopback server is unreachable from another phone; do not enable LAN, tunnels or security exceptions to sidestep that boundary.
3. **Approved isolated implementation:** add real authentication/fences, closed parser, privacy registration, additive schema, budgets, rate limits, read-time expiry, conflict suppression and exact outcome recovery in a separate candidate. Test malformed/duplicate JSON, unknown fields, identities, cross-guild inputs, clock/freshness boundaries, masked complements, replay, mixed frames, conflicts, revoked access, Native erasure, cleanup failures and lost responses. No production collection at this stage.
4. **Attended private canary, separate owner authorization:** one named consenting reporter/guild and bounded duration, no public exposure, current backup/release discipline, genuine exact-head CI, real source/receipt/readback and withdrawal/expiry evidence. No change to identity, role, floor, reset or launch gates. Do not reuse an old erased canary account.
5. **Reviewed expansion:** only after the source, privacy and abuse limits are demonstrated, owner may authorize more opted-in sources. Public access, federation totals, additional metrics and automated collection each require a further explicit decision and qualification.

Record every stage as delivered, partial, blocked or unqualified against its actual commit and evidence. Responsive desktop/mobile layout tests do not establish physical camera operation; synthetic reports do not establish real source truth; source tests do not establish deployed acceptance. Keep the local 92-command aggregate and stopped runner review loop stopped unless the owner changes that instruction.

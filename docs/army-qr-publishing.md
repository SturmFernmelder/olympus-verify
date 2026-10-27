# Army aggregate publication and historical QR scope

## Current reader and reporter

`/army` redirects eligible signed-in readers to `/#/army`. The reader and its aggregate API
require a current session and current server standing; the historical `armyPublic` /
`publicArmyPage` source names do not mean unauthenticated access. No companion is needed
to read the figures. Missing guilds are unavailable, never zero. These aggregate views do
not establish game origin, membership, unique people or complete coverage of Olympus.

The separate `/army/report` route admits current site administrators and opens the attended
reporter workspace. It does not infer reporting permission from an organizer title, a
character name or an appointment. Adding another reporter needs a separately reviewed
identity rule. New private previews and publications remain held unless
`ARMY_SITE_AGGREGATE_ENABLED` is exactly `"true"`; the accepted configuration leaves it
unset. Reporter admission alone does not authorize an unadopted exporter.

## Publisher adoption and the dedicated file

The publisher release inspected on 26 October 2026 is
[Olympus Guild 1.3.2](https://www.curseforge.com/wow/addons/olympus-guild/files/9273643),
commit [`d03ea8a9ce8d6d933dde9ce0f0ec7faa866a2df2`](https://github.com/dnl-gentile/olympus-addon/tree/d03ea8a9ce8d6d933dde9ce0f0ec7faa866a2df2).
Its read-only `OlympusBridge.GetCensusCheckpoint()` v1 is available in upstream source.
It is not the older local `GetCensusSnapshot()` / `olympus-census-v1` prototype or an
`OLCS2` website export.

The [optional exporter proposal, PR #72](https://github.com/dnl-gentile/olympus-addon/pull/72),
was still an open, unmerged draft in that review. It proposes a dedicated
`OlympusSiteAggregate` folder in the same upstream package, reading the public checkpoint
and writing only its own sanitized SavedVariables file. It adds no `GetCensusSnapshot()`
API or QR transport. A local patch, draft PR or passing synthetic test is not publisher
adoption, a CurseForge release or actual-client acceptance; installing current 1.3.2 alone
does not enable the website drop zone. There is no separate Army addon download; the old
standalone ZIP route is retired.

After separately reviewed adoption and supported-client acceptance, the proposed attended
workflow is `/olysite export`, `/reload`, then selection of only
`OlympusSiteAggregate.lua`. The current importer refuses files before reading them while
reporter admission or publisher availability is held. When available, it accepts one
dedicated file of at most 8 KiB with a strict data-only parser; it never executes Lua or
uploads the raw file. `Olympus.lua`, `OlympusVerify.lua` and account folders are not safe
inputs and are refused. See [the local compatibility candidate](../addon/OlympusGuildCompatibility196/README.md).

## Aggregate payload and deliberate publication

Only the strict aggregate snapshot is sent when an admitted reporter chooses
**Prepare private preview**. Raw files, QR frames, pictures, video, member names, notes,
GUIDs and game account identities are not fields in that accepted payload; unknown fields
are refused. This is not anonymous transport: the reporter authenticates and the server
checks the current session and authority. The server preview is not publication. After
reviewing its canonical figures, the reporter must explicitly consent to sharing with
eligible signed-in Olympus readers and choose **Publish snapshot**.

Figures count reported characters, not people. The dedicated `1.3.2-site.1` producer
exports only its own guild's masked character and online totals; class, level-band and
rank-position distributions remain unavailable. Historical v2 observations may contain
safe distributions, withheld whole if a small or unavailable bucket could expose a small
remainder. Rank positions have no authority on the website. Rereading or publishing an
observation cannot refresh its original game timestamps.

Only Olympus guild names and Alliance reports are eligible. The reporter's raw game realm
label stays on that device. Before an aggregate API request the browser replaces it with
the owner's fixed publication identifier, **World of Warcraft: Forever PvE**, and the
separate sharing-consent checkbox requires the reporter to attest that actual scope.
This attestation and identifier substitution do not prove the game realm or source. No
arbitrary free-text realm label is uploaded or stored.

A publication whose answer is lost keeps only its original aggregate and preview token in
volatile tab memory for **Check original publication outcome**. This checks whether that
exact snapshot is current; it does not prove which reporter wrote it or establish that an
earlier request wrote a superseded report. It does not retry, create a replacement request
or publish in the background. Hiding or clearing disposes unpublished review; an unresolved
original publication remains held for its outcome check rather than being replaced.
Closing the tab loses that recovery view. Clearing local data does not withdraw an already
published report or recall reader copies. No publication withdrawal action is supplied.

The current reporter's browser policy disables camera and window capture, as well as
microphone, geolocation, payment, USB and framing. The dedicated file is read only after
the user's attended selection and the availability checks above; there is no background
filesystem reader, companion, LAN listener, watcher or capture. This documentation changes
no production configuration, settings, feature flags, schema, Native E2, member admission,
identity verification or launch gate.

Each accepted exact guild name has its own storage slot: Olympus and Olympus I through
Olympus X are eleven distinct identifiers. Neither label aliases another. A report for
one guild cannot replace another guild's report.

## Historical QR and qualification limits

The separate local `OLCS2` / `/ogarmy` prototype remains historical source, distinct from
the identity QR protocols, the original `OLCS1` pilot and the dedicated SavedVariables
proposal. Its original 30-second deadline includes the normal source picker and every QR
part. Wall and monotonic clocks, matching nonce, complete-part checks, image bounds,
masking, source ages and source-interruption refusal remain part of that prototype.
Frames are payload-dependent: the limit is 1,023 payload bytes and 14 parts, not a universal
6–11-frame result. A checksum does not prove game origin or truth. Historical collector
assets are not a currently served capture workflow.

Retained desktop/mobile and Lua-to-pixel checks use synthetic aggregates and fictional
inputs, including empty, masked and populated states plus preview, consent and original
outcome recovery. Those results do not establish a new installed-game trial, physical
phone-camera acceptance, publisher adoption or production publication. This documentation
correction runs no tests and activates no importer or integration.

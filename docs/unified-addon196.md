# Unified Olympus addon connection — bounded .196 implementation

Owner: Codex subagent `master196_recovery_inventory`. Source ownership is limited to the `/olv invite` alias and native verification-column tooltip in `addon/OlympusVerify`, the new compatibility candidate in `addon/OlympusGuildCompatibility196`, Army page/report assets, this document, and new pure parser/module tests. Expanded delegation includes Army artifact retirement/build/reference entries, `site-army.ts`, projection checks and Army-focused expectations. Root owns other backend routes, `app.js`, remaining asset/build manifests, CI and provider operations. This is local implementation evidence, not upstream, game-client, peer or production acceptance.

## Current source and publisher dependency

The official [Olympus Guild CurseForge project](https://www.curseforge.com/wow/addons/olympus-guild) currently supplies Olympus 1.3.2, file 9273643. Its upstream commit/tag is `d03ea8a9ce8d6d933dde9ce0f0ec7faa866a2df2`. The inspected immutable `Olympus/Bridge.lua` is SHA-256 `d9127c4009903c8535a3e4de88785e7af31ab033fdf343e3f5f039a753e95d43`; `Olympus.toc` is `415c437e8a6f12253da14f72fbd11575d504b2e8a30cfc136e62138de578f400`. Its read-only `GetCensusCheckpoint()` API v1 is real. The earlier proposed `GetCensusSnapshot()` API and the site's OLCS2 Army frames are **not** that upstream contract.

The Army reporter now links the official project and has no standalone Army download or install prompt. It explains that the current CurseForge package cannot emit the new dedicated file. `addon/OlympusGuildCompatibility196/upstream-1.3.2.patch` is a reviewable optional upstream package patch, not an installation or a claim of adoption. It adds `OlympusSiteAggregate` beside `Olympus` in the **same release ZIP**. This separate addon folder is necessary because WoW writes SavedVariables by addon folder: adding a variable to the main Olympus TOC would put it into sensitive `Olympus.lua`.

Publisher adoption, an actual packaged release, and supported-client UI checks remain dependencies. No upstream PR/message, CurseForge publication, game installation, protected action or provider operation was performed. The website must not imply that installing unmodified 1.3.2 supplies this module or `/olv`.

## Implemented and retained capabilities

| Capability | Exact source behavior and limit |
| --- | --- |
| `/olv invite` | Aliases the existing `OlympusVerify_Flush()` path exactly once per typed command. It adds no loop, timer or alternate invite API. The existing presence, capacity, expiry and hardware-action checks remain. Preview's allowlist continues to block this command. This command belongs to the existing OlympusVerify source, not unmodified CurseForge Olympus. |
| Guild Window verification column | Existing watcher snapshot, native-row identity, current guild, preview, combat, gamepad, stale-list and duplicate-name checks remain. The actionable row tooltip now explicitly says **Whisper Unverified**. One click opens an exact-recipient editable draft; it never sends chat or changes verification authority. Real-client layout/protected action acceptance remains separate. |
| `/oly discord <code>` | Upstream supports signed OLC2/OLK2/OLY4/OLB5 material and the high-councillor / deterministic 3-of-5 model. Public placeholder backend keys and all accepted .194/.195 Link-OFF and activation gates remain. The Army workflow neither activates Link nor establishes a peer signature. |
| `/oly approved paste` | Upstream `Workshop.lua` consumes genuine author-signed `HT1~...` material. A bot-admin UI can validate, display or copy existing author-signed material; a bot signature is not an author signature. No signing key is requested, read, invented or installed by this work. |
| Dedicated local export | The optional module deliberately processes only the current exact native guild's fresh, undisputed `roster` checkpoint. Relays and seen-only guilds are refused. No raw member rows, linked-alt estimate, source guild keys, chat, identities, secrets or signatures enter the exported variable. |
| Branch capacity / Alt | One own-guild aggregate is available when actually supplied. Missing Olympus I–X branches and Alt routing remain unavailable, never inferred as zero/full/room. Root owns dynamic capacity/banner consumers. |

## Dedicated export contract

The reviewed candidate provides `/olysite export`, then `/reload` writes `WTF/Account/<account>/SavedVariables/OlympusSiteAggregate.lua`. `/olysite clear` clears the dedicated variable; a reload is needed to write the clear to disk. A failed export clears any previous in-memory export before returning a refusal. There is no event-driven export or upload.

The variable is a closed data object:

```lua
OlympusSiteAggregate = {
  ["schema"] = "olympus-site-aggregate",
  ["version"] = 1,
  ["producer"] = "1.3.2-site.1",
  ["capturedAt"] = 1792756800,
  ["realmGroup"] = "Forever PvE",
  ["faction"] = "Alliance",
  ["guild"] = {
    ["name"] = "Olympus I",
    ["observedAt"] = 1792756800,
    ["characters"] = 100,
    ["online"] = 20,
  },
}
```

`characters` is an integer 5–1000 or `"few"`; `online` is zero, an integer at least five, `"few"`, or `"unavailable"`. Small totals withhold online; small nonzero offline remainders also withhold online. Those rules are applied **before the file is written**. This contains character counts, never exact unique humans. Classes, levels and ranks are unavailable because the checkpoint does not supply those distributions.

The browser accepts exactly one named dedicated file, at most 8 KiB. It uses a bounded, data-only grammar supporting quoted keys, scalar strings/integers and nested record tables. No Lua evaluation, expressions, function calls, code, comments, extra variable assignments, duplicate keys, unknown fields, prototype names or raw uploads are allowed. Raw Olympus/Verify SavedVariables files are refused by name before reading; disguised copies are refused by schema/field validation. Original capture/source timestamps remain. Source age exceeds 24 hours → refuse; online age exceeds 900 seconds → withhold. Import-time masking never rehabilitates a private count already exposed in the file.

The browser normalizes to the existing ordered `olympus-stat-observation-v2` one-row snapshot using actual `addonVersion: "1.3.2-site.1"`, `source: "volunteer-client"`, `sourceVerified: false`, `membershipProof: false`, and null distributions. This producer identifies the local compatibility contract, not an official upstream version or cryptographic proof. The game realm stays local; the existing server preview uses the fixed owner scope `World of Warcraft: Forever PvE` / Alliance with explicit reporter attestation. Selecting the file sends no file or aggregate. Private preview and publication are separate explicit actions; current reporter admission, consent, lost-answer outcome handling and Native privacy fences remain.

The local review clears after five minutes, on backwards clock movement, page hiding or page exit. Publication success also clears the local import card. Clearing local memory does not delete published data or reader copies. The page no longer requests camera/display capture permission.

## Parent SPA reporter lifecycle

The canonical `/army/report` now independently admits the current reporter before returning a private 302 to `/#/army/report`. The admitted `/army/report/fragment` endpoint returns only the authored inert `<section class="army-site" data-army-reporter-fragment>` content. It includes no scripts, stylesheet links, iframe, header, body or remote shell. Root mounts it inside the existing SPA frame, preserving its original avatar/header/navigation and uses strict same-origin, response-type and captured-context checks before insertion.

`OlympusArmyReportTool.mount(root, {isCurrent, owner, isOwnerCurrent})` scopes every ID and event to that fragment. `owner` is the captured stable user object; `isOwnerCurrent` independently checks the same original user/community standing without depending on the route. Its controller provides `busy()`, `clear()`, `onComplete()`, `canLeave()` and `destroy()`. `OlympusArmyLocalImportTool.mount(root, {report, isCurrent})` attaches its local importer and provides `clear()` / `destroy()`. Reporter destruction disposes the importer too. All listeners and intervals are removed; late file reads and preview answers cannot paint a disposed root. No shared document-body classes or historical collector globals are changed.

Before the exact publication request, the aggregate/token is deeply frozen and retained in module-private memory with its original owner. `OlympusArmyReportTool.isNavigationHeld()` and controller `canLeave()` let Root block SPA route changes and warn on page exit while a publication/outcome is pending or unknown. A forced destroy aborts the transport but preserves that original operation. Different-owner or still-pending mounts are refused. A same-owner remount performs only current reporter admission, then offers a deliberate exact original outcome check. It never retries publication, automatically queries an outcome, or exposes the token through its public API. Owner revocation continues to hold rather than transferring material. Closing the entire tab still loses this in-memory recovery view.

## Root integration hooks

1. Root has added backend Army literal/type admission for `1.3.2-site.1` while retaining historical stored `0.2.0`. No schema change or copied identities are needed. All existing 443-object/Native E2 admission and write fences remain; coordinated backend qualification still belongs to Root.
2. Root has added the SPA Army loader for `/static/army-live/sanitized-export.js` before `army.js`. Standalone Army HTML already does so. Reporter HTML loads `savedvariables-import.js` after `report.js`.
3. Expanded Root delegation authorized active retirement integration: the exact legacy `/static/army-live/olympus-army-addon-0.2.0.zip` now returns admitted private 410; unadmitted collector paths return private 404 before asset storage. Only the exact 62,615-byte active ship-tree ZIP was removed, SHA-256 `8aeb5d78b55457116c43961bc13e598f3dd66561303c909e2d9c96aacb36303c`. Historical Git/source/other worktree copies remain immutable.
4. `scripts/build-army-addon.cjs --write` now refuses before writing; `--check` requires the old artifact to be absent. Historical pure `prepare()` remains for offline provenance. Projection guards now bind eight exact non-art Army CSS/JS resources and forbid resurrecting the ZIP. Army entries only were updated in `official_asset_reference.json`; Root owns refreshing its enclosing hash and other asset pins. New assets are canonical browser files, not generated copies of the old pilot protocol. `pilot.js`, `decoder.js` and old pilot source remain historical code but are not reporter-admitted, loaded or deliverable. Original historical browser QR timing/recovery assertion leaves remain in the test suite and do not claim current HTML activation.
5. Root owns truthful dynamic latest-snapshot timestamps, guild capacity/Alt UI, author-signed HT1 Admin helper and any final unified-package decision. Missing evidence cannot be repaired by a relabel or successful parser test.

## Bounded validation

`node --test-timeout=120000 addon/OlympusGuildCompatibility196/tests/sanitized-export.test.cjs` exercises real parser/report/import scripts with synthetic data. Initial test setup used CommonJS `require()` on a file under a `type: module` package and returned an empty module; it failed before coverage. The harness was corrected to load the same browser global in `vm`, without modifying the production parser or weakening assertions. Final focused cases cover unknown identity/chat/key fields, executable Lua/duplicate/prototype rejection, freshness/privacy boundaries, exact normalized producer, local-only file selection, explicit private preview, separate consent and local expiry. This is not physical Safari/game/client acceptance or production qualification.

Final local results: dedicated parser/import 59 checks; LuaJIT synthetic optional-module and actual slash/preview handler leaves 27 checks; existing Army browser contracts 56 checks, all passed. Each executed leaf had a maximum 120-second bound; no SQLite database, Workerd, real invite, game-client or provider operation was executed. The Army browser loader imports an existing SQLite helper module, which prints Node's experimental warning, but this browser leaf does not instantiate a database. Its first run retained 53 passes / 3 failures caused by Windows-default text decoding corrupting existing Unicode test expectations; those exact original UTF-8 strings were restored and all 56 passed. No assertion, source deadline, or old raw failure was suppressed. Backend fixture expectations are updated for the new producer, no-capture policy and zero-fetch 410/404 retirement; their SQLite execution belongs to Root's coordinated lane.

The follow-on scoped lifecycle leaf adds eight checks covering removal of every listener/interval, zero-request refusal of an invalid original context, single-mount ownership, late read/preview isolation, pending/unknown original retention across forced destroy, same-owner explicit recovery with exact material, different-owner/revoked-owner refusal and zero automatic retries. It uses synthetic transport/DOM only. Existing historical collector fixtures use an explicit test adapter and never re-enable the retired shipping path.

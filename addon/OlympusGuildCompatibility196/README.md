# Olympus site aggregate — local compatibility reference

## Publication status checked 28 October 2026

[Upstream PR #72](https://github.com/dnl-gentile/olympus-addon/pull/72) merged on 26 October 2026 as
`71bc357c251b49a167821cc0b7f922eb69fa35b6`. The public [GitHub 1.3.3 release](https://github.com/dnl-gentile/olympus-addon/releases/tag/v1.3.3)
and [CurseForge listing](https://www.curseforge.com/wow/addons/olympus-guild) now list Olympus 1.3.3. Source adoption and
publication therefore supersede the earlier draft/pending status. Package-byte verification, installation in the
supported client, actual SavedVariables/lifecycle behavior and website admission remain separate qualifications.

This folder retains the older local 1.3.2-based compatibility source and patch; it is not byte-identical to the
maintainer's 1.3.3 module. Upstream's TOC version is `1.3.3-site.1`, while its wire producer deliberately remains
`1.3.2-site.1` to preserve the accepted parser contract. Upstream now uses the server clock and a stricter fresh
own-roster/lifecycle contract. Its deliberate command is `/oly site export`, with `/olysite` as a compatibility
alias. Neither publication nor a wire label establishes game-origin authentication or activates website admission.

## Historical local preparation and retained contract

The initial candidate targeted Olympus 1.3.2, commit `d03ea8a9ce8d6d933dde9ce0f0ec7faa866a2df2`. The original draft
submission and the local source described below are historical preparation evidence, not current upstream-byte or
real-client acceptance. Later local changes still require their own tests.

The accompanying patch adds an optional `OlympusSiteAggregate` folder to the **same upstream release package**, depending on `Olympus`. WoW writes SavedVariables per addon folder; merely declaring a new variable in the main Olympus TOC would mix it into the sensitive `Olympus.lua` file. This separate file boundary is necessary. It is not a separate Army download. A reviewed unified build would provide `/olysite export` and `/olysite clear`. The user deliberately exports, runs `/reload`, then selects only `WTF/Account/<account>/SavedVariables/OlympusSiteAggregate.lua` on the reporter page. The normal `Olympus.lua` file is not safe input and is always refused. There is no executable, watcher, background upload or added QR protocol.

`SiteAggregate.lua` consumes `OlympusBridge.GetCensusCheckpoint()` v1. It exports one exact current native guild, only a fresh, undisputed `roster` observation. Relays, seen-only observations, identities, linked-alt estimates, keys, chat and private addon state are never copied. Counts below five and small offline remainders are withheld before SavedVariables is written. Classes, levels, ranks, other branches and Alt routing remain unavailable. The local producer identifier `1.3.2-site.1` is not an upstream release version or a game-origin signature.

`upstream-1.3.2.patch` changes the pinned historical package script and adds the optional folder. Apply only after comparing that source; do not apply it blindly to a newer or externally managed installation. Supported-client TOC/loading and game behavior still need their own acceptance; publication does not install or verify the module on an officer's machine.

## Reporter input and disposal (.197)

The reporter keeps the drop area reachable so it can cancel the browser's file-opening default while import is blocked. The containing group reports its disabled state to assistive technology; the native file input remains disabled. Pending access, unqualified site admission, hidden views and unresolved publication outcomes still refuse a file before reading it. When the reporter is admitted, dropping the one dedicated file reviews it locally; private preview and publication consent remain separate actions. Selecting a replacement clears the earlier preview before the new local read completes.

Importer disposal immediately disposes its reporter, removes both controllers' listeners and intervals, and refuses late reads. An original pending or unknown publication remains held for the same owner's deliberate outcome check; disposal never retries or replaces it. The focused `tests/reporter-lifecycle.test.cjs` cases model these browser events and races with synthetic data. Real browser and client acceptance remain separate from those local checks.

# Olympus Verify officer addon download

Current package: **Olympus Verify 0.6.38** (checked 13 November 2026).

The unified addon setup page links to `/static/olympus-verify/olympus-verify-0.6.38.zip` and `/static/olympus-verify/version.json`. These are the only two files the Worker serves under `/static/olympus-verify/` (`worker/src/verify-addon-download.ts`). They accept public GET and HEAD on the site host only, need no cookie and never query the database. Any other path under that folder, and either file on another host, answers 404; a method other than GET or HEAD on either file answers 405. The earlier ZIPs still in the folder (0.6.27 to 0.6.37) are kept in Git but never served. Other static files keep their own access rules.

Olympus Verify is the officer verification addon. The separate **Olympus Guild** CurseForge connection and its optional site aggregate exporter are unchanged. The retired standalone Army addon remains unavailable.

## Installing an update

Exit the game before updating. Extract the `OlympusVerify` folder into `Interface/AddOns`, merging the public files. Keep your existing private `Config.lua`, the generated exchange files (`OlympusQueue.lua`, `OlympusLaunchQueue.lua`, `OlympusLaunchSelected.lua`, `OlympusVerifyLists.lua`) and your SavedVariables: the ZIP never contains them. A new officer installation still needs its separately authorized private configuration and Watcher setup; `Config.example.lua` is an example, not an active configuration. Downloading the addon grants no membership, invite or role authority.

Use **Olympus Verify 0.6.38** with **Watcher 0.6.39**. The Watcher update adds local custody diagnostics and an attended offline recovery utility; the addon package and exchange protocols are unchanged. Copy the complete public Watcher source package while retaining its existing private configuration and state. The current discovery reader uses `officer-operations-v235`; an older addon cannot load those pages. Selected promotion checks keep their separate protocol. A loaded projection reports the evidence it loaded, not a live bridge or permission to act after its source expires.

## How the package is built

`scripts/build-verify-addon.cjs` builds the ZIP and `version.json` from the public source in `addon/OlympusVerify/`. Run it from the repository root: `--write` rebuilds both files, `--check` (the default) rebuilds them in memory and fails on any difference from the tracked copies.

- **Version.** The package version is the single `## Version:` line of `addon/OlympusVerify/OlympusVerify.toc` (0.6.38). The ZIP name follows it. `VERIFY_ADDON_VERSION` in `worker/src/verify-addon-download.ts` names the served file and must be raised in the same change; the download test fails if the setup page and the package disagree.
- **Contents.** An explicit allow-list of 22 public files, in a fixed order: `Bindings.xml`, `Config.example.lua`, `Libs/OlympusHmac.lua`, `Libs/OlympusQr.lua`, the `OlympusVerify.toc` and the 17 `OlympusVerify*.lua` modules. A file that is not on the list never enters the package, whatever else is in the folder. A missing, empty, linked or oversized (over 1 MiB) source file stops the build, so a partial package cannot be written.
- **Private files.** The builder reads only the allow-listed files and its own source. It never opens a local game installation, `Config.lua`, the generated exchange files or SavedVariables. `version.json` lists these exclusions under `localFilesExcluded`: `Config.lua`, `OlympusQueue.lua`, `OlympusLaunchQueue.lua`, `OlympusLaunchSelected.lua`, `OlympusVerifyLists.lua` and `SavedVariables`.
- **Reproducibility.** Entries are stored uncompressed with UTF-8 names, Unix mode 0644 and the fixed date 1980-01-01, so two builds of the same source are byte-identical. `version.json` records each entry's size and SHA-256, the whole ZIP's size and SHA-256, and the builder's own size and SHA-256.

## Checks

- `node scripts/build-verify-addon.cjs --check` runs in the `worker` CI job.
- `node scripts/tests/verify-addon-package.test.cjs` checks that two builds are identical, that the tracked ZIP and manifest equal a fresh build, the exact 22-file allow-list, every ZIP record against its source and manifest entry (using Node's own CRC), that the builder never asks for a private or generated file, and that a missing or oversized source file cannot produce a package.
- `node scripts/tests/verify-addon-download.test.cjs` sends requests through the actual Worker entry with a fixed asset binding and database and provider traps: the exact bytes and headers, HEAD, refusal on the bot and unknown hosts, refusal of other methods and path aliases, that an earlier package path answers 404, and the setup page links.

Hosted release qualification, deployment and native-client acceptance remain separate from these local checks.

## Historical

Until 12 November 2026 this page described the 0.6.21 package of build .235 (6 November 2026): 17 listed source files, and a builder that pinned the three reviewed 0.6.21 performance-repair files by digest and copied the rest byte for byte. The owner retired source pins as build admission gates; the package digests in `version.json` now describe the current bytes, and the old pins remain only in Git history.

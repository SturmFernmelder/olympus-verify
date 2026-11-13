# Olympus talent library (.169)

The original Olympus calculator reads a self-hosted, reviewed snapshot, not a third-party script or iframe.
It changes no account, guild, role, privacy, launch or production setting. The route and asset pins are integrated
separately by the release owner.

## Data and provenance

Primary source: <https://talentsforever.com/data.json>. Per-class exports are also offered at
`https://talentsforever.com/export/<class>.json`, using the nine lowercase class names.
[Source terms](https://talentsforever.com/terms) and [about page](https://talentsforever.com/about) explicitly permit
reuse of the author's reading, checking and arrangement under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Retain linked attribution, the license link, an indication of normalization and the Blizzard exclusions.
Blizzard's game text, names, icons and artwork are not licensed by that grant. No source website code, icons or
artwork are copied. The small letter sigils and all calculator code/styles are original Olympus work.

### Current snapshot: 10 November 2026 export (revision `02e1e101d1a5`, since 12 November 2026)

The owner ruled on 12 November 2026 that the calculator moves to the newest available data export and that older build
codes stay readable as an archive. The current upstream payload is 1,756,078 bytes, SHA-256
`02e1e101d1a5695e5c4d687b19cd74bc11bd82b9123d8386d6a1cdc1a0387a60`, generated `2026-11-10`. It is the source's read of
client build `1.60.1.70755` plus the server hotfixes of 3, 4, 6 and 10 November 2026 from the hotfix cache, as each
class's source line states. It is not a live-client read or independent in-game verification, and the source says some
values follow Blizzard's development notes of 2 November 2026 ahead of game data. The exact download is retained in the
private release evidence as `talentsforever-source-02e1e101d1a5.json`; it is not loaded by visitors. The normalized
`worker/public/static/talents/data.json` (498,935 bytes, SHA-256 `d8b516b2…5e0e`) and the source's hash, byte count and
limits are bound by `worker/public/static/talents/provenance.json`, which contains no local filesystem paths or account
identifiers.

Coverage: nine classes, 27 trees, 467 talents and 1,297 rank descriptions. Class talent counts: Warrior 53, Paladin 51,
Hunter 50, Rogue 54, Priest 52, Shaman 50, Mage 53, Warlock 52, Druid 52. Normalization creates deterministic
class/tree/talent IDs, resolves the 72 named prerequisites to IDs, renames fields, leaves out the per-talent source, icon
and hotfix-date fields and excludes unrelated spellbook/racial/Legacy content and remote icon references; no talent text
or rank value is changed. The genuine same-row prerequisites (Holy Shock before Boundless Light, Mind Flay before
Improved Mind Flay) are preserved; prerequisites need not be in an earlier row, but must resolve within the tree without
a cycle.

All 467 nodes retain the supplied Classic comparison: 268 changed, 48 same, 30 moved and 121 new. A changed talent may
also be moved (131 are); both badges are shown. The 346 existing counterparts contain the supplied Classic rank-one
reference, and the 85 Classic-only rows remain available under their trees. These records are not a complete
independently allocatable Classic tree or every Classic rank. The source does not state an exact Classic client build,
so the UI does not invent one or extrapolate missing rank descriptions.

Artwork: the 10 November mapping (`talents/art.json`) reuses the Blizzard artwork imported in .170 where a talent keeps
an icon already on file. The 17 talents whose icon is not on file are listed in `talentIconsUnavailable` and show the
calculator's plain no-art tile; no new artwork was fetched.

Archive: the 16 October snapshot stays at `/static/talents/archive/260cf99b52db/` (`data.json` and `art.json`). The
calculator loads it only to open a build code made on that revision, read-only; new builds and attachments use the
current snapshot. The current checks are in `worker/tests/evergreen1112_talents_test.cjs`.

### Historical: 16 October 2026 snapshot (revision `260cf99b52db`, .169 to .279)

These facts describe the archived snapshot, not the current one. The upstream payload was 1,734,440 bytes, SHA-256
`260cf99b52db5fd0085043d4d3c2d5dde1b47dffe88b9696c94caccc9fb03588`, generated `2026-10-16`, and every class's source
identified beta client build `1.60.1.70425`; the download is retained as `talentsforever-source-260cf99b52db.json`.
Coverage was nine classes, 27 trees, 466 talents and 1,313 rank descriptions (Warrior 52, Paladin 50, Hunter 50,
Rogue 53, Priest 52, Shaman 50, Mage 55, Warlock 52, Druid 52), with the same-row Holy Shock/Divine Precision and Mind
Flay/Improved Mind Flay prerequisites. Its Classic comparison was 271 changed, 53 same, 25 moved and 117 new, with 349
existing counterparts and 82 Classic-only rows. It was a beta snapshot, not live hotfix data or independent in-game
proof.

## Native interface

Load `/static/talents/calculator.css` and `/static/talents/calculator.js` from the normal admitted site shell.
The script exposes:

```js
const controller = await window.OlympusTalents.mount(container, {
  className: "warrior",              // optional lowercase class name, default warrior
  build: optionalBuildCode,           // optional versioned code; invalid imports show a refusal
  onBuildChange({ className, build, level, points }) {
    // The app owner can replace the current hash without remounting the tool:
    history.replaceState(null, "", "#/talents/" + className + "/" + build);
  }
});
// On route teardown, prevent a pending data load from painting an abandoned container:
controller.destroy();
```

The callback reports valid allocations, reset, level and class changes. Compare/focus changes do not change a build.
Codes are `ot1.<snapshot-revision>.<class>.<level>.<rank-vector>`; they bind the precise snapshot so a later talent
layout cannot silently reinterpret an old build. They contain no account data. The copied URL uses the normal
`#/talents/<class>/<code>` route. Builds are not saved to a server or local storage.

The standard point budget is level minus nine, for levels 10–60. Legacy Talented extra points are deliberately not
modeled and are disclosed in the UI. A node requires five points per earlier row and its prerequisite at maximum
rank. Every change validates the full remaining build, so refunds and lower levels cannot strand a dependent
talent or overspend. Reset returns the same selected class/level to a zero vector.

All descriptions and names use text nodes. Grid placement uses scoped CSS/data attributes, not inline styles.
Each tree has a roving keyboard entry; arrows move within its grid, Enter adds, and minus refunds. Pointer and touch
users also have explicit plus/minus controls and a persistent details panel. Classic comparison does not change
the allocation rules. The only tool fetch is same-origin `/static/talents/data.json`; no CSP expansion is needed.

CommonJS exports expose the same pure `validateData`, `pointsAtLevel`, `emptyBuild`, `validateBuild`, `allocate`,
`serializeBuild`, `parseBuild` and `comparisonBadges` functions for the focused real-data suite:

```sh
cd worker
node tests/talents169_test.cjs
```

That suite validates actual coverage/provenance, class roundtrips, tier and prerequisite cases, blocked refunds,
invalid imports and source immutability. It does not replace integration/browser QA or certify game-server tuning.
Historical: it pins the 16 October counts and hashes (466 talents, 1,313 ranks), so it fails on the current snapshot;
`node tests/evergreen1112_talents_test.cjs` checks the 10 November data, its provenance and the archive.
Because the Worker package is ESM, the Node fixture loads the exact unmodified browser IIFE in a CommonJS VM realm.
Refreshes are attended: fetch once, check the license/source/build, normalize without guessed values, update the
provenance and revision, rerun focused assertions and review the release asset pins. The browser never refreshes
its dataset from the external source.

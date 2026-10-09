# Source provenance and publication

What the tracked tree is made of, what never enters it, how the generated and derived files are produced, and how a
public snapshot of this repository is prepared. Written 1 October 2026 for the consolidation (Olympus Verify as the
keeper of Olympus Forever's better mechanisms) and the planned publication of the repository.

## What is tracked, and what never is

The tracked tree is the Worker (`worker/`), the addon (`addon/`), the watcher (`watcher/`), the operator tools
(`tools/`), the policies (`policies/`), the documentation (`docs/`) and the repository scripts (`scripts/`,
`.github/`). Everything a running installation needs that is private stays outside Git, by name:

- secrets and local configuration: `worker/.dev.vars` and `.dev.vars.*`, `.env` and `.env.*`, `watcher/config.json`,
  `addon/OlympusVerify/Config.lua` (their `.example` siblings are tracked and hold placeholders only);
- runtime state and logs: `watcher/state.json`, `watcher/watcher-state*.json`, `*.log`, the game's `WoWChatLog.txt`,
  the client's `SavedVariables/`;
- dumps and archives: `*.sqlite*`, `*.db`, `*.bak*`, `*.dump`, `*.zip`, `*.7z`;
- local evidence: `artifacts/`, `docs/probe-results/2026-*`, `tools/out/`, and the publication output `.publication/`.

`.gitignore` lists them; `scripts/scan-secrets.sh` (CI) scans the whole history with Gitleaks; the publication helper's
audit (below) refuses any of those names in a snapshot regardless of content.

## Generated files

- `worker/src/policy-content.ts` is GENERATED from `policies/privacy.html` and `policies/terms.html` by
  `worker/scripts/build-policy-content.mjs` (`npm run build:policies`); `npm run check:policies` fails when they differ.
  The Worker serves the policies from it at `/privacy` and `/terms`; the GitHub Pages mirror publishes the same HTML.
- `worker/public/static/wow/*` (92 images, two WOFF2 fonts) are DERIVED from the game client's textures by
  `tools/build-site-assets.py`: crops, rearrangements, format changes, alpha and tint transforms, nothing redrawn. The
  input was a named extraction of the client made on the officer's computer on 30 September 2026
  (`wow-assets-2026-09-30`, with the client's own `Interface/` and `Fonts/` paths); it is not in the repository. The
  script is kept at its exact reviewed bytes and is never run automatically. `worker/public/static/wow/asset-provenance.json`
  records every derived file (SHA-256, dimensions, client path, transform, the input's hash) and the proof's scope:
  pixel lineage against that extraction, not a publisher archive or client build attestation. the owner's instruction of
  1 October 2026 governs the selection: generated and custom artwork belongs to the Discord application only; the
  website uses official World of Warcraft assets. The generated mountains left the site in build .86, and so did the
  custom crest until build .111 brought it back as the website's one owner-approved exception: the brand and tab icon
  `worker/public/static/olympus-icon.png` (the owner's decision of 1 October 2026), pinned by path and hash in the
  publication reference.
- On 2 October 2026 the owner separately requested their own Discord picture in the signed-in top bar. This is
  external identity data loaded from `https://cdn.discordapp.com`, not a new bundled interface-art asset: the producer,
  renderer and CSP are source-pinned. Other eight account-picture sites keep official game icons. It does not relax
  the crest usage, local artwork/font paths, extractor or static/CSS guards, and grants no image ownership or licence.

## Ported modules

The community modules under `worker/src/community-*.ts` were ported from Olympus Forever (the donor Worker, the same
owner) one reviewed commit at a time between 30 September and 1 October 2026, following Codex's adapter map: each port
names its donor source and frozen candidate manifest in its module header, and both agents' reviews are in the
consolidation log (`Olympus/consolidation-2026-09-30/claude_code_x_codex.md`, outside this repository). The rank planner
(`worker/src/site-ranks.ts`, `worker/public/static/rank-planner/`) came from the frozen rank-planner input prepared from
the owner's document "Forever Guild Rank Codex.html".

## The publication helpers (`scripts/`)

Six files, five Python files (Python 3.12 or later, standard library only; `Path.is_junction` is used) and the pinned JSON reference. The historical .115 successor
was prepared from keeper `da5076de690ede5254efa723c69df9f1ffd6ecd3` (tree `2a888b603e5851e13b70eb942c650a73e918b8dc`): reference
`59cedafab72dd414c35fc54d846d2505df6d1d5d847dd553cd36e8c16abaabf1`, `official_assets.py`
`c1ea7a2252d0e70602b7bb388700463411ba017b9f041417ced74ee6571103be`, and `reconcile_public_root.py`
`581655a76146bd29373013254ad2b5ea52ce9f2ff41bc154be3d460a826b4434`. Its external source-reference coverage receipt is
`ca2f59b40477122eafd43aeff927cb1baa0386127d5bbbd9384a96a0ee0f7f38`; it retains the original official asset/map evidence and pins five full art-sensitive source files.
The .115 successor binds all 63 runtime files, including guild-seats.ts, site-news.ts, roster-effects.ts and scheduled-budget.ts. Only app.js and site-data.ts change among the five fixed art-sensitive pins; the rank planner remains at its reviewed baseline.
This records source identity, not helper execution, publication readiness, browser acceptance or either final signature.
Prior .112 bundle (Codex's
reviewed successor `publication-reference-crest112-v1`, integrated byte for byte after both reviews on 1 Oct 2026): `official_asset_reference.json`
`25adf12020bcbcc2dc2fca24512821f2d0f91b2f453beb7ff877b43128571e66` (the four fixed files at `32f19b9`, the crest as the one owner-approved
exception at `worker/public/static/olympus-icon.png`, `867aafaa…`, brand and tab icon only), `official_assets.py`
`fa3146e36fe51d86609441daa8d19988190982cd5df6593934376eee6ecbcccd`, `stage_publication.py`
`d06f6d56c9884f5cb9e7c07acde75ad5f812f0a77fe68589d49115ab68b358e9` (origin `https://github.com/SturmFernmelder/olympus-verify.git`), and the unchanged
`validate_publication.py` `7dde5b31…`, `publication_audit.py` `d4a059cb…`, `public_history.py` `77adf892…`; the public provenance record
`worker/public/static/wow/asset-provenance.json` `098d187303b7fbdee9179b2fa8177185686ad9c373fe549dbd59764a28b54068`. History: the first
integration, byte-for-byte from Codex's reviewed publication-helper V4
candidate (manifest `f605767454a40f96032302afae8b0229dd8bebd07832d81821aa19e5ebf07aff`) except for a disclosed
CRLF-to-LF normalization of three of them, which the repository's `.gitattributes` requires (recorded in the
consolidation log with the hashes before and after):

| file | role |
|---|---|
| `publication_audit.py` | bounded, redacted scan of a repository's tracked Git objects and commit messages: credential-shaped tokens, credential-literal assignments (placeholders excepted), private file names, runtime or person-identifier shapes; hardened Git environment (no replace objects, hooks, global config or credential variables; file protocol only); reports rules and lines, never excerpts |
| `public_history.py` | builds the public parent as a NEW local repository from exactly the reachable objects of the pinned public head, and refuses any keeper ancestry in it |
| `official_assets.py` | the exact byte and reference gate for the website: the pinned reference (`official_asset_reference.json`), the 94 official image and font files, the native CSS/JS, the provenance record, the required documents, the deployment-profile files, the approved extractor, the banned custom-art hashes, the five fixed art-sensitive source files (including the CSP/avatar producer), and the static reference scan of every runtime file |
| `stage_publication.py` | stages the keeper head ADDITIVELY onto the public parent with Git plumbing (no filters, no fetch, no commit, no push; the push URL of the new repository is disabled), refusing collisions with public-parent files, unclassified blocking findings and non-additive diffs, and running the asset gate over the complete result, the staged tree and the worktree; writes a manifest that always says `readyForPublication: false` |
| `validate_publication.py` | re-derives all of it independently from the manifest |
| `official_asset_reference.json` | the pinned reference the gate loads (its hash is in `official_assets.py`) |

The gate requires seven documents at pinned bytes (`LICENSE`, `README.md`, `CLAUDE.md`, `THIRD_PARTY_NOTICES.md`,
`docs/source-provenance.md`, `docs/design.md`, `docs/deploy-checklist.md`), six deployment-profile files
(`worker/wrangler.toml`, `worker/wrangler.cutover.toml`, `scripts/cutover-config.sh`,
`scripts/tests/cutover-config.test.sh`, `worker/tests/account_copy_test.cjs`, `.github/workflows/ci.yml`) and the one
optional marker `worker/wrangler.cutover.applied`. Five source files that carry image helpers, server vocabulary, rank
artwork and the CSP/avatar producer (`worker/public/static/app.js`, `worker/public/static/rank-planner/app.js`,
`worker/src/site-data.ts`, `worker/src/site-ranks.ts`, `worker/src/site-core.ts`) are fixed to a source-bound reference: changing one needs a newly reviewed reference successor,
never a recalculated hash. The asset contract and the asset manifest the helpers take are externally reviewed files
whose SHA-256 values both agents know; they are not in this repository until the final head is chosen.

How a snapshot is prepared (an owner-run step on the final, jointly signed head; the helpers never publish anything): with
the reviewed bundle committed here (the current hashes above: the six V4 files and the Pages helper and guard as one set,
the reference naming the fixed files and the crest exception, both origins `https://github.com/SturmFernmelder/olympus-verify.git`), copied by the owner into a
reviewed runner root outside this checkout and outside the public clone; `docs/launch-runbook.md` section 5 gives the steps.

```bash
# <runner> is the owner-reviewed runner root (outside the keeper and the public clone), holding the reviewed bundle in <runner>/scripts/
python3 <runner>/scripts/publication_audit.py --repo <keeper checkout> --head <keeper sha> --out <runner>/out/audit-<keeper sha>.json --current-only
python3 <runner>/scripts/stage_publication.py --keeper-repo <keeper checkout> --keeper-head <keeper sha> \
  --public-repo <a clone of the public repository at the pinned parent> --public-head e0c1fcee23f69bf61ad4054cd86a95c73d3413d9 \
  --out <runner>/out/snapshot-<keeper sha> --require-official-assets --literal-classifications <file> \
  --asset-contract <contract.json> --asset-contract-sha256 <its sha256> \
  --asset-manifest <manifest.json> --asset-manifest-sha256 <its sha256>
python3 <runner>/scripts/validate_publication.py --manifest <runner>/out/snapshot-<keeper sha>-manifest.json \
  --keeper-repo <keeper checkout> --public-repo <the same clone> --out <runner>/out/validate-<keeper sha>.json \
  --asset-contract <contract.json> --asset-contract-sha256 <its sha256> \
  --asset-manifest <manifest.json> --asset-manifest-sha256 <its sha256>
```

The helpers pin the public parent `e0c1fcee23f69bf61ad4054cd86a95c73d3413d9` of the repository
`olympus-verify-policies` (the policy mirror). The committed helpers name the exact future origin
`https://github.com/SturmFernmelder/olympus-verify.git` in both `stage_publication.py` and `reconcile_public_root.py` (the owner-authorized name, not
a claim that the rename has happened; the earlier helpers named the policy mirror's origin), never a relaxed check. Every output lives below the runner root, outside this checkout and outside the public clone: the staging helper
requires a new output below its own root and refuses one that overlaps the keeper or the public clone (so it cannot
write into the keeper, `.publication/` included), and the staging reads Git objects, not the working tree.
The Pages reconciliation writes into its own separately reviewed namespace outside the keeper, the public clone and the
additive output.
`scripts/tests/publication-helper.test.sh` (CI) checks that six Python files compile (the five V4 helpers and the
reconciliation helper), that four CLI helpers answer `--help` (`publication_audit.py`, `stage_publication.py`,
`validate_publication.py`, `reconcile_public_root.py`), and that the sixth V4 file, the JSON reference, is present and
loads at its pinned hash; the canonical fixture tests stay with the candidate.

### The Pages reconciliation helper (Codex's v2 successor, 1 Oct 2026, integrated 10:4x UTC)

Two more files beside the six, copied byte for byte from the reviewed candidate
`Olympus/consolidation-2026-09-30/candidates/pages-policy-reconciliation-v2` (Codex's 10:39 UTC handoff): `scripts/reconcile_public_root.py`
(the prior successor's `d2751f76fb211b4480f394a84e8cb31fdb7c2176ff2cd52e120374c538e88dae`, 28,094 bytes, LF, pinning that bundle and the
future origin; the v2 bytes `a091d12cc1fad672b781438a854099a7708fe2bfdf96e1709268a79545b26dcb`, 28,103 bytes, are history) and `scripts/pages_network_guard.cjs`
(SHA-256 `58d40e687a62d1a43bf8eabb90a9431ce84994db1e810651a919dc9b58ab4f13`, 350 bytes, LF). The helper is the exact
pre-commit reconciliation of the public repository's three root HTML files (`index.html`, `privacy.html`, `terms.html`)
with the keeper's policies: it verifies the six V4 files' and the guard's SHA-256 before importing them, runs the same
native policy generator and checks parity, keeps the additive V4 staging and validation unchanged, pins the old roots,
and writes only into a separately prepared owner namespace outside every repository, bound by an owner marker and two
externally attributed review receipts; its result stays `ready=false`, it never commits, pushes, approves or publishes,
and its push origin is disabled. Running it beyond `--help` is the owner's step, like the other helpers. The guard is a
Node preload that refuses every unmapped network call while the helper's native generator runs. The historical .114 successor
changed only the two V4 consumer pins and its `GENERATOR` pin to the exact `worker/scripts/build-policy-content.mjs`
`a17d609b3b30987ade103934dbf3b0d385a2398d5c57178192e542133e9cd2ba`; the guard, approvals, origins, private-history checks and output gates are unchanged.

## What "publication" means here

Making the repository public is the owner's action, after both agents have signed the same final head and the gates
above have passed on a fresh snapshot of it. A passing gate is an integrity statement about bytes and references; it is
not a licence, not a rights determination and not either agent's signature. The repository stays proprietary when
public (`LICENSE`); `THIRD_PARTY_NOTICES.md` says what in it is not the owner's.

## Owner-authorized takeover on 3 October 2026

The owner asked Codex to finish the work after Claude Code reached its usage limit and explicitly removed the dual sign-off requirement. Historical joint reviews above remain historical records. New releases require an exact source identity, independent Codex review, passing required checks, and separately recorded publication and deployment evidence; no new Claude signature is required. Codex may perform the authorized publication steps. The helpers remain local preparation and validation tools and never publish by themselves.

## 9 October 2026 - .121 incremental rank-planner reference

The current reference advances the rank-planner source and its existing official-image bindings for the owner-selected
High Council preset. The original official candidate/map hashes remain the inherited pixel and font basis; no image
or font bytes are replaced. reference_source_head identifies product candidate 8174d26ccf2534aef36d54d488c5e70f5948d0eb.
Fresh metadata-only finite coverage SHA256 610bfa0317e4815f3315966ec0998b66760da8fe7a4e098bffb14e3a376c7841
checks all 103 asset rows and five fixed-art source rows. It separately records the unchanged app.js and policies.css
runtime files whose old asset-row hashes and lengths were stale. The reference and both consumers carry updated
dependency pins. This is byte/reference evidence, not a rights determination or an agent signature.

The incremental public PR preserves public ancestry and does not use the historical initial/additive staging helper.
Exact local checks, required CI, scoped reviews and the final external contract/manifest bind the final release head
separately. The AddOn guide and browser planner apply no native guild permissions or appointments.

The planner retains the owner's 1 October choice, "Crest is the exception", for its existing brand and tab icon.
The v2 finite receipt rebinds only the rank HTML source; the 103 asset bytes and the other four source pins match.

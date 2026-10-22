# Third-party notices

What in this repository is not the copyright holder's own work, where it comes from, and what is claimed about it.
The repository itself is proprietary (`LICENSE`); nothing below is licensed by that notice, and nothing below is a
statement about rights beyond what each source's own terms provide. Last reviewed 1 October 2026.

## World of Warcraft interface artwork and icons

`worker/public/static/wow/` holds 92 images derived from the World of Warcraft game client's interface textures:
frames, buttons, check boxes and radio buttons, class, role, profession and position icons, the parchment and rock
textures, the loading-screen crop used as a background (below the game's logo, which is not used), and the banner icon
used on cards, notices and the rank planner's masthead. Every file is a crop, a rearrangement, a format change or an
alpha/tint transform of one texture, pixel for pixel; nothing is drawn or redrawn. The textures were read from a named
extraction of the client made on the officer's own computer on 30 September 2026 (the extraction itself is not in this
repository), through the project's own script `tools/build-site-assets.py`, whose exact bytes are pinned in the
provenance record and which is never run automatically.

`worker/public/static/wow/asset-provenance.json` (public, served with the site) records for each file its SHA-256,
dimensions, the client path it came from and the transform applied; its proof scope is pixel lineage against that
extraction, not a publisher archive or client build attestation.

These images are the property of Blizzard Entertainment, Inc. The site is a free, non-commercial fan project and says
so on every page; it is not affiliated with or endorsed by Blizzard Entertainment. No licence to redistribute the
images is claimed or granted by this repository.

## The Olympus crest

Build .167 adds the original Point and Interact cursors from the owner's offline Classic Era 1.15.9.70003 client
extraction. The two 32-pixel PNGs preserve the source palette and alpha without redrawing or scaling. Their separate
source hashes, client paths and conversion record are in `tools/wow-cursor-provenance.json` and appended to the public
asset provenance. The same Blizzard ownership and limited pixel-lineage claim above apply to these two additions.

`worker/public/static/olympus-icon.png` is the Olympus crest, the guild's own logo (the one shown on
guild.roachcouncil.com). Since build .111 it is the site's brand and tab icon, by the owner's decision of 1 October
2026, and it is the website's one image that does not come from the game client. It is not a game texture, it is not
derived from one, and it is not attributed to Blizzard Entertainment. The publication reference pins it by path and
SHA-256 (`867aafaa300e9f83479504b1d7c91478e4099bcc52d3e3a0172b8b55a1784d66`).

## The two interface fonts

| file | client source | name recorded in the font | embedded notice (retained) |
|---|---|---|---|
| `worker/public/static/wow/friz-quadrata.woff2` | `Fonts/FRIZQT__.TTF` | Friz Quadrata TT | names International Typeface Corporation, 1997 |
| `worker/public/static/wow/morpheus.woff2` | `Fonts/MORPHEUS.TTF` | Morpheus | names Kiwi Media/Design, Eric Oehler, 1996 |

Both were converted from the client's TrueType files to WOFF2 by the same script, with their name tables and embedded
notices intact; the provenance record lists the retained name, cmap, hhea, maxp and OS/2 tables. They are not the
copyright holder's, they are not licensed under `LICENSE`, and the Terms of Service say the same to every visitor.

## The rank planner's catalogue

`worker/public/static/rank-planner/catalogue.js` preserves the rank names, aliases, purpose notes and mention counts of
the copyright holder's own document "Forever Guild Rank Codex.html" (supplied 30 September 2026), which gathered 26
rank ideas from 15 earlier drafts. The planner page links to the GitHub repository Gethe/wow-ui-source, a third party's
reference mirror of the game's interface source (not an archive published or attested by Blizzard Entertainment), as a
reference for the rank cap and the authenticator rule; nothing from that source is copied into this repository, and the
link is labelled "Read the Guild Control reference".

## Modules ported from Olympus Forever

The community modules (`worker/src/community-*.ts`: the admission fence, the member directory and crafting offers, the
calendar and attendance, trial reviews, restriction cases, departure review items, the contribution ledger and its pure
policy, the private request intake, the officer digest and the coverage report) were ported, one reviewed commit at a
time, from the copyright holder's other repository, Olympus Forever, during the consolidation of 30 September and
1 October 2026. They are the copyright holder's own work; they are listed here for provenance, not as third-party code.
The consolidation log (`Olympus/consolidation-2026-09-30/claude_code_x_codex.md`, outside this repository) records each
port's source candidate and both agents' reviews.

## Code that is the project's own

The addon's SHA-256 and HMAC-SHA256 implementation (`addon/OlympusVerify/Libs/OlympusHmac.lua`) is the project's own
code written to the specification shared with `worker/src/codes.ts` and `watcher/codes.py`; it is not a bundled
library. The addon's offline test harness (`addon/test/harness.lua`) needs a Lua `bit` library at run time (lua-bitop
in a Lua 5.1 interpreter, or LuaJIT's built-in through Lupa in CI), which is not included.

## Development dependencies, not redistributed

Declared in `worker/package.json` and installed only when developing or in CI: `@cloudflare/workers-types`,
`typescript`, `wrangler` (each under its own licence, in `node_modules/`, which is not tracked). The addon suites run in
CI through Lupa 2.8 (LuaJIT 2.1), installed by the workflow. The asset extractor needs Pillow, fontTools and brotli when
it is run by hand. None of these is part of the repository.

## Optional census tests: upstream files retrieved at test time

`addon/tests/fixtures/community-census/` contains this project's synthetic fixture, proposed optional Bridge extension,
contract and exact provenance pins. The tests read `Olympus/Data.lua` and `Olympus/Bridge.lua` from
`dnl-gentile/olympus-addon` commit `f60f18814f2426a5c21f97e207611871a06366b4`, supplied locally or explicitly retrieved
into temporary CI storage. Those upstream files are not bundled or copied into this repository; their original bytes
are checked against the recorded SHA-256 before execution and afterward. No verified copying grant was present in
the inspected subset, and this notice asserts none. The proposed extension is this project's local test proposal;
upstream 1.2.3 does not provide that optional method. It is composed with the pinned original Bridge only in memory
for the test, and is not represented as adopted upstream code. Existing dependency notices above still apply.

## Olympus Link core: copied under the MIT License (.186)

Build .186 copies three files of `dnl-gentile/olympus-addon` at commit `d03ea8a9ce8d6d933dde9ce0f0ec7faa866a2df2`
into `worker/vendor/olympus-link/`, byte for byte: `web/worker/link-core.mjs`, `web/worker/schema.sql` and the
repository's `LICENSE`, the MIT License, "Copyright (c) 2026 Olympus addon contributors". That licence was verified at
this exact commit, and its full notice is kept with the copies. This deliberately differs from the census note above,
which concerns another commit and other files that are not copied. `worker/src/link-core.ts` is generated from the copied
`link-core.mjs` (four reviewed patch groups, a header naming the source and the licence) and carries the same notice by
reference. `worker/tests/fixtures/olympus-link/vectors-d03ea8a9.json` is upstream's test vectors from the same commit,
with every seed field and the two derivable backend token fields removed. Pins and patches: `worker/vendor/olympus-link/README.md` and `docs/olympus-link.md`.
These files are the contributors' work under their licence; this repository's own `LICENSE` does not cover them.
Build .186 (and the planned .190) was never released; the copies ship with build .194. Its fourth patch group keeps
an uncertain role grant or rollback pending rather than treating the stored character as a completed grant.

## Trademarks

World of Warcraft, Battle.net and Blizzard Entertainment are trademarks or registered trademarks of Blizzard
Entertainment, Inc. Discord is a trademark of Discord Inc. Cloudflare is a trademark of Cloudflare, Inc. GitHub is a
trademark of GitHub, Inc. Their use here names the services the project runs on or talks to; it implies no affiliation
or endorsement.

### talentsforever.com data snapshot (.169)

The normalized Forever talent dataset is derived from [talentsforever.com/data.json](https://talentsforever.com/data.json), generated 16 October 2026 for client build 1.60.1.70425. Its source arrangement/data is credited to Talents Forever under the publisher's CC BY 4.0 terms; see [the local provenance and license notice](worker/public/static/talents/LICENSE-DATA.txt) and [the import notes](docs/talents-data169.md). The normalized schema, original native renderer, validation and share encoding are adaptations. Blizzard retains its game names and talent text; the data license does not grant rights to Blizzard artwork or trademarks. No calculator-site code, icons, images, scripts or styles are included.

Addon and guide catalogs link to named publishers and authors. Public feed titles and dates link back to their original articles; remote article bodies, scripts and images are not mirrored. Catalog checking is not publisher endorsement, an exhaustive addon list, compatibility certification or a guarantee of future beta behavior.

### Blizzard talent artwork (.170)

The .169 paragraph above describes the original data-only import. Build .170 separately includes Blizzard World of Warcraft talent icons and tree backgrounds distributed at Talents Forever's public /assets/icons/ and /assets/bg/ paths. The exact per-file source URLs and hashes are in worker/public/static/talents/art-provenance.json. World of Warcraft artwork remains copyright Blizzard Entertainment; the Talents Forever data license and this repository's code license do not license that art or grant publisher endorsement. The renderer/layout code is original Olympus code. No Talents Forever executable scripts, styles, branding or advertising were copied.


### Original Dark Portal login-render candidate (.171)

The .171 delivery candidate uses a WebM animation and JPEG poster rendered locally from Blizzard's original `ui_mainmenu` scene in an installed Classic Era1.15.9.70003 client: model FileDataID131970, its two skins and25 referenced textures, original camera0/model lighting, sequence0, UV animation and particles. These remain Blizzard World of Warcraft artwork. Their separate intended provenance is `worker/public/static/wow/login/dark-portal-provenance.json`; its exact rendered-output hashes, original input hashes and renderer/capture limits are recorded separately from the earlier site-art history. The120second WebM duration is presentation metadata from the Codex render recipe; its container-only correction preserves the compressed frame payloads, rather than proving an exact encoded final-frame end or a mathematically seamless loop. This is not a movie published by Blizzard, a claim of pixel-identical client rendering or a proved complete particle-animation period. Neither this repository's application license nor the unrelated Talents Forever data license grants rights in that art or implies endorsement.

The product includes only the reviewed derivative media, its bounded provenance and the project's finite offline verifier. Original client model/skin/texture files, renderer runtime/source bundles, SDKs and build archives are not bundled. Rendering/extraction tools and their own dependency licenses remain separate operational evidence; the verifier performs no rendering, downloads or game-file access. Historical artwork/source notices above remain unchanged.


### Owner-approved Olympus Dark Portal illustration (.172)

The login still worker/public/static/wow/login/olympus-dark-portal.png is a custom imagegen illustration approved by the owner on 19 October 2026. It uses the .171 original-scene poster as a composition reference and the owner-supplied Olympus crest as the shield reference. The output is 1672x941, 2761774 bytes, SHA256 7c344640d2dd628a6b235323cb27a2a8962ac4026a920d2c1809b652b1494342. It is not an official Blizzard-published image, an untouched client asset or a claim of pixel-identical logo reproduction. Blizzard retains its World of Warcraft artwork and trademarks; no affiliation or endorsement is implied. The exact approval is a narrow login-art exception and does not license or authorize other custom/generated artwork. The .171 rendered media and notices remain historical records.


### Fullscreen Olympus portal variants (.173,19 October 2026)

The owner-approved expanded wide and portrait login PNGs are custom AI-generated outpainted variants produced with the built-in image_gen tool from the prior custom Olympus portal scene. They are not untouched game extractions or official Blizzard-published images. Their exact file identities and classification are recorded in scripts/official_asset_reference.json; prior game artwork/font attribution and retained .171/.172 provenance remain unchanged. The custom shield crests are illustrated interpretations of the supplied Olympus emblem; pixel-identical reproduction and native4K are not claimed.


### Method leveling guide allocations (.185, kept by the owner's decision of 21 October 2026)

worker/public/static/talents/guide-builds179.js embeds 14 talent-rank allocations, as rank vectors only, taken from Method's public WoW Forever leveling guides (method.gg) for seven classes. Each plan is shown with its class guide's author, update date and a link to the guide. Plans that do not fit the current talent snapshot (Priest and Shaman) are omitted, never altered. No guide text, images, code or branding is copied, and loading a plan only changes the local calculator. Method's terms reserve its copyrighted material. On 21 October 2026 the owner decided to keep these allocations with this per-plan attribution ("Keep with attribution") rather than ask Method or link only. Method and the named authors do not endorse Olympus, and a plan is not a claim of an optimal build or of current tuning.

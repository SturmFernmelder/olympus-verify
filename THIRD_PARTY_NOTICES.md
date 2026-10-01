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

## Trademarks

World of Warcraft, Battle.net and Blizzard Entertainment are trademarks or registered trademarks of Blizzard
Entertainment, Inc. Discord is a trademark of Discord Inc. Cloudflare is a trademark of Cloudflare, Inc. GitHub is a
trademark of GitHub, Inc. Their use here names the services the project runs on or talks to; it implies no affiliation
or endorsement.

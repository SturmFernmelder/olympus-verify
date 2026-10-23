# Resource sources (.169, owner items3/4/11)

The catalog is a curated source snapshot, not an exhaustive inventory, a guild addon requirement, independent
in-game qualification or a claim of a final beta meta. Its `checkedAt` records the actual source check; a file's
`releasedAt`, guide scope and advertised client are separate facts. No addons, paid guides, article bodies,
pictures or publisher branding are mirrored. The directory adds original summaries of the owner's supplied
recommendations and qualifications. Authors retain their licenses and attribution.

## Reviewed catalog

`worker/public/static/resources169.json` preserves21 addon choices,12 guide/source entries and7 news/discovery links.
General tools and Forever-focused discoveries are separate; a Forever tag on an established addon does not mean it
is a new Forever-exclusive project. Bag and boss-mod alternatives need not be installed together. A compatible boss
mod core does not establish complete coverage of new encounters. ForeverAuras explicitly remains beta development.

The practical guide default is Wowhead/Icy Veins for class explanations, WoW-Professions for profession routes and
Blizzard for official changes. Method and Mobalytics add useful authored coverage. Individual page authors, dates,
builds, level ranges and untested sections matter more than a blanket reputation claim. Independent data tools are
supplemental: The Forever Era discloses nonsimulation gear scoring without procs/set bonuses; Classic WoW Forever
discloses methodology and AI assistance; Forever Codex's retrievable fallback was older than its JavaScript status.
Warcraft Tavern's primary search listing was found, but direct body extraction was unavailable in this check.

The catalog retains publisher links for each claim. Additional scope evidence:

- [Wowhead's named class writers/reviewers](https://www.wowhead.com/forever/news/level-30-guides-are-here-meet-our-wow-forever-class-writing-team-383169).
- [Babyhoof's patch1.60.1/October6 level30 Fury guide](https://www.wowhead.com/forever/guide/classes/warrior/fury/level-30-dps-overview).
- [Icy Veins' named-author level30 Hunter example](https://www.icy-veins.com/wow-forever/beast-mastery-hunter-ranged-dps-pve-guide).
- [WoW-Professions' explicitly untested Alchemy225–300](https://www.wow-professions.com/forever/alchemy-leveling-guide).
- [RestedXP's October9 report of1–35 route completion](https://community.restedxp.com/word-of-warcraft-forever-updates-10-09-2026/).
- [TUGs' beta12–30/Classic30–60 qualification](https://www.curseforge.com/wow/addons/guidelime_tugs).
- [Zygor's coming-soon and partial-launch disclaimer](https://zygorguides.com/forever).
- [CurseForge's actual Forever filter](https://www.curseforge.com/wow/search?class=addons&gameVersionTypeId=88568&page=1&pageSize=20&sortBy=relevancy).

Prices, private class Discord content and paid guide contents were not qualified. Public project listings establish
the author's advertised Forever file; they do not replace testing the exact installed file on the current client.
Automated structured CurseForge ingestion would need an authorized API key under its documented API; this feature
uses direct links and requires no new credential.

## On-demand headlines

`site-resources.ts` accepts only three compiled-in feeds, verified by anonymous public GET during source research:

| Source | Actual feed | Attribution/scope |
|---|---|---|
| Official development-note thread | `https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-updated-october-15/2360696.rss` | Blizzard-hosted official notes thread; preserve each post date and open the original for context |
| Wowhead Forever | `https://www.wowhead.com/news/rss/all` | Publisher's exact `Forever` category, not a title guess or an exhaustive archive |
| Wowhead Forever Blue Tracker | `https://www.wowhead.com/forever/blue-tracker?rss` | Publisher's Forever tracker with original Blizzard links; not an independent Blizzard publication |

The complete Wowhead RSS retrieval was278639bytes, so the byte cap is1MiB. Item URLs can use `/news=383436/...`;
requiring `/forever/` would silently omit valid entries. The blue-tracker's advertised endpoint is the Forever path
with `?rss`; `/rss` returned404. The adapter preserves its fixed honest `OlympusFeedReader/1.185` User-Agent.
Earlier public-client200-XML evidence belongs to that check, not a new production-egress observation.
Blizzard News supplies HTML at `/en-us/feed/world-of-warcraft`, not a verified RSS endpoint,
so it remains a direct link. Forum category349 has RSS but includes community topics; it is not labelled all-official.

The adapter refuses redirects, wrong content types, non-UTF8 and oversized responses; a fixed8second deadline covers
headers plus the complete body. Cancellation is requested without waiting for a broken acknowledgement. The bounded
XML reader refuses DTDs/declarations/external processing, has no entity/network resolver and accepts only predefined
or valid numeric XML entities. Only plain titles (at most240 Unicode characters), allowed publisher HTTPS links and
validated dates survive. No descriptions/HTML are returned. Malformed or future publication dates omit the item;
an absent date is explicitly null. Each source has at most12 headlines.

Only public publisher records are cached, under fixed source-ID keys. Freshness is10minutes; retained public data
may be shown as explicitly stale for at most24hours after a failed refresh. The DTO separates `fetchedAt` (successful
retrieval's start time), `checkedAt` (last actual attempt), and each item's `publishedAt`; loading a page from cache
does not advance either retrieval timestamp. A failure never invents successful freshness. Cache failures fall back
to source reads and do not establish permission. No incoming request, session, account, authorization result, D1 row
or membership response is a cache key or value. There is no new table, cron statement/job, dependency, setting, flag,
credential, permission, Floor/private control or schema change in this module.

## Integration contract

The server route preserves current authenticated, non-denied, in-server `applicantWrite`/admitted-read checks before
fetching and again before returning. Game Updates are available to signed-in accounts without confirmed in-game
membership; the separate Community News switch does not gate them. `loadResourceUpdates({enabled:false})` performs
no cache or network access. A true boolean passed directly
to the pure adapter is not an authorization capability and must never be exposed as a client parameter. The root
route owns those unchanged admission checks; source-only adapter fixtures do not qualify the route's authority.

The browser module is `window.OlympusResources.mount(container,{view:'addons'|'guides'|'updates',onRefused?})` and returns
`{destroy}`. It uses plain DOM/text and canonical publisher links without external images. Addon/guide views read
only the same-origin catalog. The updates view reads only `/api/resource-updates`, every60seconds while visible and
admitted, plus a manual refresh; server caching can reuse data for10minutes. Hidden/unmounted views stop polling and
abort active reads.401/403/404/503 stops polling, clears displayed updates and calls `onRefused(status)` for the root's
normal sign-out/community-refresh behavior. No browser authorization/member result is persisted.

`resources169_test.cjs` checks the actual source parser and renderer with public RSS fixtures, explicit injected
fetch/cache ports, unsafe URLs/XML/dates, body caps, cancellation, freshness and visible-view lifecycle. It is not a
provider scrape, an account test, an in-game addon test or a substitute for the root's route/browser qualification.

## Full October18 owner directory (.196 successor)

The additive `ownerDirectory` object restores all five thematic sections of the owner's retained October18 request:
main websites and named authors; class communities and theorycrafting checks; independent tools and methodology;
in-game guides and quest helpers; and confidence, beta scope and evidence. Its separate ten-row corrections appendix
preserves the material corrections from the owner's sixth section. This is an original structured summary, not copied
publisher prose, a reputation certificate or a complete inventory of the internet. The existing21/12/7 IDs and order
remain unchanged. The old catalogue `checkedAt` still dates that older selection; `sourceCheckedAt=2026-10-18` dates the
owner review and `reconciledAt` dates this new content construction. Those three clocks must not be conflated.

The renderer contract is optional `ownerDirectory:{version:1,title,sourceCheckedAt,reconciledAt,scopeNote,sections,
corrections}`. Exactly five sections have `id,title,intro,blocks`; each block has a heading, plain `text` array and
`links:[{label,url}]`. Each section has at most12 blocks, each block at most12 texts and12 links, a240-character
heading and4000-character paragraph cap. Corrections have `claim,treatment,links`, at most20 rows; the current directory has ten. No HTML, images,
embedded tools, private Discord invites, paid content, new network adapter or persistent store is introduced. Links
use only the renderer's existing HTTPS publisher-host allowlist. Source lists remain separate from current admission.

Public source rechecks on23October2026 retained these distinctions:

- [Wowhead's team article](https://www.wowhead.com/forever/news/level-30-guides-are-here-meet-our-wow-forever-class-writing-team-383169)
  still identifies the named Hunter/Rogue review relationships and the Warlock/Paladin community connections.
- [Icy Veins](https://www.icy-veins.com/wow-forever/class-guides) and
  [Method](https://www.method.gg/wow-forever/leveling-guides) link nine classes;
  [Method's dungeon directory](https://www.method.gg/wow-forever/dungeons) links the four named new walkthroughs.
- [WoW-Professions Alchemy](https://www.wow-professions.com/forever/alchemy-leveling-guide) retains its provisional
  beta/material qualifications. The three Crix Mobalytics profession articles now display October21 revisions;
  the owner's earlier15/14/16October observations remain historical rather than overwritten as fresh dates.
- [TUGs](https://www.curseforge.com/wow/addons/guidelime_tugs) retains beta12–30 and Classic30–60 fallback wording;
  [Questie's releases](https://github.com/Questie/Questie/releases) contain actual Forever data additions and fixes.
- [RestedXP's dated report](https://community.restedxp.com/word-of-warcraft-forever-updates-10-09-2026/) is a publisher
  statement of1–35 completion. Its product roadmap still places Forever35–60 after launch and identifies interim Era
  routes. Prices are deliberately omitted because entitlement, current contents and prices need a purchase-time check.
- [Zygor](https://zygorguides.com/forever) still marks Forever coming soon. The October18 partial-launch qualification
  is kept as an attributed historical observation, not a new extraction claim.
- [Classic WoW Forever's crafting page](https://classicwowforever.com/professions/crafting/) retains the dated860/299
  comparison; [Blizzard's over600 announcement](https://news.blizzard.com/en-us/article/24303313/world-of-warcraft-forever-deep-dive-panel-recap)
  has different scope. [Codex status](https://forever-codex.com/status/) still serves the older70245 fallback and
  explicitly defers live figures to JavaScript. No whole-site freshness inference is made.
- Warcraft Tavern article retrieval returned403. The Forever Era's current text extraction did not expose the
  previously reviewed BiS methodology. Their entries explicitly separate the owner's dated assessment from a fresh
  article-body or simulation review; neither failure is silently relabelled a successful check.
- [Blizzard's October16 art clarification](https://eu.forums.blizzard.com/en/wow/t/datamined-in-the-latest-beta-build/636148)
  supports the general warning about interpreting datamined records. This external source is recorded here without
  expanding the public renderer's closed host allowlist. The older secondary developer interview and sponsorship
  disclosure remain owner-supplied context, not newly certified publisher facts.

The level30 examples are historical beta material; this directory does not say the beta remains open onOctober23,
promise complete Forever endgame tuning, or change the local stat model's E/D/U provenance. The corrected Olympus
Guild entry retires the separate ArmyZIP wording and distinguishes the actual1.3.2 GetCensusCheckpoint contract from
the prepared optional website exporter. Publisher adoption and actual installed-client behavior remain external.

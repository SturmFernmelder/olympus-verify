# Resource sources (.169, owner items3/4/11)

The catalog is a curated source snapshot, not an exhaustive inventory, a guild addon requirement, independent
in-game qualification or a claim of a final beta meta. Its `checkedAt` records the actual source check; a file's
`releasedAt`, guide scope and advertised client are separate facts. No addons, paid guides, article bodies,
summaries, pictures or publisher branding are mirrored. Authors retain their licenses and attribution.

## Reviewed catalog

`worker/public/static/resources169.json` records21 addon choices,12 guide/source entries and6 news/discovery links.
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
| Wowhead Blue Tracker | `https://www.wowhead.com/blue-tracker?rss` | Third-party all-WoW tracker, not a Forever-only or independent Blizzard feed |

The complete Wowhead RSS retrieval was278639bytes, so the byte cap is1MiB. Item URLs can use `/news=383436/...`;
requiring `/forever/` would silently omit valid entries. The blue-tracker's advertised endpoint is `?rss`; `/rss`
returned404. Blizzard News currently supplies HTML at `/en-us/feed/world-of-warcraft`, not a verified RSS endpoint,
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

The server route must preserve existing `newsOn` and `confirmedGuildData` admission before fetching and again before
returning. `loadResourceUpdates({enabled:false})` performs no cache or network access. A true boolean passed directly
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

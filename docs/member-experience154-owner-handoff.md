# Member guild hall .154 — owner handoff

Release build: **2026-10-13.154 Member guild hall**. AddOn: **Olympus Verify 0.6.9**.
Baseline: public .153, commit `49a23b6e18eedf3e36a50d1d5c660c4a606043ea`.
Final .154 commit: recorded in `C:\Users\vikto\OneDrive\Apps\Olympus\release-member-guild-hall154-2026-10-13\release.json`, alongside the final qualification and owner command. This document is part of that committed source; the external receipt supplies its final commit without a self-referencing hash.

## What this release changes

- A signed-in guild hall and member navigation; privacy, terms and the assets required to render sign-in/policies remain public. Existing server-side admission and protected-action checks still apply.
- Current adopted R7 governance, with a deep operational charter and an actual directed browser chart/list. Pan, zoom, keyboard, office detail and fit/reset controls accompany the complete 95-title index. Adoption is by the authorized guild administration on 13 October 2026; it supplies no invented named signature, new appointment or applied game permission. The unchanged R6 PDF/ZIP downloads are historical archives; use current source or print for R7.
- AddOn 0.6.9 native guild-row verification display and one-member editable reminder, with unknown/stale handling and no automatic send. The optional Olympus Guild bridge supplies public display-only Council hints, **no census or local verification authority**. `/olv browser` preserves upstream `/oly` ownership.
- Original member-facing news guidance, attributed ONN links and a **future Town Crier commission proposal**. No Town Crier holder is appointed, no scraper/import is installed, and no external post or Discord consolidation is performed by deployment.

## No database preparation

**No D1 migration is needed. No journal install, guard reinstall, initializer, recovery replay or reopen command belongs to this release.** Do not run remote `schema.sql`, `db:init`, all migrations, the fixture-only rejection installer or the old .144 admission installer.

Keep the committed .153 configuration: installed admission, account access and local retention ON; erasure, new private intake, QR signing and membership transition OFF/unset. The existing cron stays every 30 minutes. Frozen privacy580 and unpublished canary582 are not deployment inputs. This release does not complete all-store erasure, every-copy replay or B1 signing.

## Exact owner-run deployment

Root first records the final source/test/bundle/browser receipts. The commands below stop on a missing receipt, wrong HEAD or dirty tracked/untracked source. The owner runs them in ordinary PowerShell; agents do not execute provider commands.

```powershell
Set-Location -LiteralPath 'C:\Users\vikto\.codex\olympus-worktrees\member-experience154'
$taskExpectedCommit = (Get-Content -LiteralPath 'C:\Users\vikto\OneDrive\Apps\Olympus\release-member-guild-hall154-2026-10-13\release.json' -Raw | ConvertFrom-Json).commit
if ($taskExpectedCommit -notmatch '^[0-9a-f]{40}$') { throw 'Missing final qualified .154 commit' }
if ((git rev-parse HEAD) -cne $taskExpectedCommit) { throw 'Wrong release commit' }
if (git status --porcelain) { throw 'Release source is not clean; stop' }
if (-not [string]::IsNullOrEmpty($env:CLOUDFLARE_ENV)) { throw 'This profile has no Wrangler environments' }
Set-Location -LiteralPath '.\worker'
& 'C:\Program Files\nodejs\node.exe' '.\node_modules\wrangler\wrangler-dist\cli.js' deploy --config '.\wrangler.toml'
if ($LASTEXITCODE -ne 0) { throw ('Preserve the original deployment outcome; Wrangler exit ' + $LASTEXITCODE) }
```

This uses the selected worktree's existing local Wrangler and its committed `worker/wrangler.toml`, without another config, name or environment override. Do not substitute the frozen privacy candidate or canary. Preserve the original deployment output/version. If the reply is lost or uncertain, reconcile that original deployment before considering a second write.

## Readback and acceptance

The bot-host health result at `https://olympus-verify.roach-council.workers.dev/health` must show `2026-10-13.154 Member guild hall` and D1 `ok`. Then check an anonymous browser reaches sign-in and privacy/terms without exposing member pages; use an actual member session to check the guild hall, R7 book and directed chart. Check desktop/mobile, list toggle, search, keyboard pan/zoom, reset/fit, links, print and historical archive labels. Root records actual results; none are asserted by this handoff alone.

```powershell
$taskHealth = Invoke-RestMethod -Uri 'https://olympus-verify.roach-council.workers.dev/health'
if ($taskHealth.build -cne '2026-10-13.154 Member guild hall' -or $taskHealth.d1 -cne 'ok') { throw 'Unexpected live build or database health' }
$taskHealth | ConvertTo-Json
$taskGuest = Invoke-WebRequest -UseBasicParsing -Uri 'https://olympus.roachcouncil.com/'
if ($taskGuest.Content -notmatch 'Sign in with Discord' -or $taskGuest.Content -match 'id="boot"|src="/static/app.js"') { throw 'Anonymous sign-in boundary failed' }
$taskScriptStatus = & curl.exe --silent --output NUL --write-out '%{http_code}' 'https://olympus.roachcouncil.com/static/app.js'
if ($LASTEXITCODE -ne 0 -or $taskScriptStatus -cne '401') { throw 'Anonymous application source was not refused' }
```

These unauthenticated readbacks must use a fresh request without browser cookies. Existing signed-in users can inspect the code delivered to their own browser; no website can disable their developer tools. The login wall prevents new unauthenticated delivery and asks crawlers not to index; it cannot retract earlier public copies, search caches or repository history.

Install the **complete** matching AddOn 0.6.9 separately. Preserve local Config.lua, watcher queue and SavedVariables. Restart the client, leave preview OFF and check the real native guild roster, narrow/legacy fallback, scrolling/recycled rows and current versus stale/unknown identities. Open one eligible online member's reminder, verify the exact complete recipient and editable text, and stop without sending during acceptance. Confirm an existing chat draft is preserved and preview/combat block the shortcut. Check `/olv` and the upstream AddOn's `/oly` together. Local Lua checks cannot replace these real-game observations.

The owner observed 0.6.7 loading with no Lua error, but its inline column overlapped the Guild window's navigation and `/olv ui` lacked an alias. Version 0.6.8 addresses both: a framed panel docks outside the whole window with a navigation gutter and fit check, and `ui`/`panel` open the existing officer panel. The same module list permits a Lua reload to apply this layout fix; a full restart refreshes the TOC version display. The corrected placement and editable whisper still need the owner's live observation.

The owner then confirmed the navigation and panel command, and reported a second conflict with the selected member's details. Version 0.6.9 follows native frame layering and hides the verification panel while the source-defined member-details popup is open, restoring it when that popup closes. This changes neither the native window nor verification status. The owner reported every row as Stale; no live whisper test was attempted, and old/missing/future snapshot dates remain held rather than becoming permission to contact a member.

Final live layout acceptance: after the 0.6.9 reload, the owner selected a member, opened and closed the native details, and replied **“It works perfectly.”** The panel command and native navigation/details placement are accepted. An exact-recipient editable whisper remains untested because the loaded verification snapshots are stale; no message, roster sync or verification proof was sent during acceptance.

The current browser bridge's signing gate remains disabled. No native promotion, Council appointment, secret reset, Discord role change, external message, channel deletion or permission change is part of these checks. Saved Discord channel IDs and retention-safe consolidation steps are in `discord-member154-consolidation.md`; they are a proposal, not an executed merge. Upstream provenance and API limits are in `addon-guild-roster-integration.md`.

## Ten-request completion map

| Request | Source result and remaining work |
| --- | --- |
| 1. Discord wall / indexing | Implemented: script-free entry, private app/assets/guild APIs/downloads, finite policy/identity-rights exceptions, robots and response headers. Owner deployment and live signed-member readback remain. |
| 2. Duplicate chats | Current history, pins, threads and private View settings inspected. Exact keep/archive plan prepared; owner executes the Discord steps separately. |
| 3. Shared Warcraft theme | Implemented for policies, forms, sign-in, reader and chart; only existing official game assets/fonts used. |
| 4. Real organization chart | Implemented: directed SVG, office cards/mandates, list, search, pointer/keyboard pan, zoom, fit and selected-office focus. |
| 5. High Council | Identified and explained: PvP/Raiding War Heads, Federal Treasurer, Artisanry/Heraldry ministers and accepted Justice/other scoped Council mandates; native rank, seat/vote and permissions remain separate records. No new holder is appointed. |
| 6. In-game column / whisper | Implemented in AddOn 0.6.9 with GUID and freshness checks, supported-layout column/fallback, one editable exact-recipient reminder and no automatic send. Owner's real client acceptance remains. |
| 7. CurseForge integration | Inspected 1.2.3/source/API; implemented opt-in public Council hints and collision-free commands. Full census sync is unavailable because the inspected public bridge exports no member census snapshot. No private tables are read. |
| 8. ONN improvements | Original news-resource guidance and attributed links implemented. Existing calendar/RSVP/directory features retain their controls. No article import or Town Crier appointment; a future commission proposal follows below. |
| 9. Contact wording | Implemented approved officers/moderators/administrators wording on behalf of Asmongold and Rich Campbell; Rich's previously confirmed `richwcampbell.` account is named as contact. No address was invented. |
| 10. Final charter / explorer | Current R7 adopted by authorized administration on 13 October; expanded operational charter and current print/source reader. Historical R6 PDF/ZIP stays clearly dated; individual appointment templates are completed only for real appointments. |

## Future Town Crier commission proposal

Office: Town Crier, within Heraldry. Proposed work: one original daily digest with date, author, attributed sources, corrections and links to the guild calendar; distinguish news, opinion and official decisions. A published notice does not amend the charter or appoint a person. The editor obtains permission for reused material, excludes personal cases/credentials, and links to external reporting instead of mirroring articles. A correction records its date and reason. The person, accepted mandate, posting access and review term are recorded separately after recruitment. This release contacts nobody, appoints nobody and creates no automatic publisher.

The existing .153 committed snapshot is the presentation rollback reference. An owner-run rollback keeps the same admission-ON profile and signing/destructive selectors OFF, needs no database downgrade, and cannot recreate expired data or establish erasure/replay readiness.

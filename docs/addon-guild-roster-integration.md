# Guild roster verification and Olympus Guild coexistence

**Current author release (12 November 2026): Olympus Guild 1.5.8.** The 1.3.2 and 1.3.3 readings in this document are dated records. What 1.5.7 and 1.5.8 changed, and every activation limit of the integration, is in [the integration record](dan155-integration.md#current-status-12-november-2026). The limits that concern this document:

| Off now | Before it is switched on | Who switches it |
|---|---|---|
| The Olympus Guild display read (`/olv olympus on`, `GetCouncil()`): off after every reload. | An officer turns it on for one session; council names stay display hints. | The officer at the keyboard. |
| The local census viewer (`/olv census on`): off after every reload. | An officer turns it on for one session; it writes no SavedVariables and uploads nothing. | The officer at the keyboard. |
| Code self-submission from Dan's "My Discord verification" entry (`QueueSelf`): not accepted. A queued code is a pending local request, never verification. | A Lua check of Dan's current consumer against `OlympusVerifyBridge242.Status()`, and the owner resuming member-interaction acceptance, which stays owner-held. | The owner; Codex Root releases any code change it needs. |

**Publication status checked 28 October 2026:** [upstream PR #72](https://github.com/dnl-gentile/olympus-addon/pull/72)
merged on 26 October as `71bc357c251b49a167821cc0b7f922eb69fa35b6`. Both the public
[GitHub v1.3.3 release](https://github.com/dnl-gentile/olympus-addon/releases/tag/v1.3.3) and the
[official CurseForge listing](https://www.curseforge.com/wow/addons/olympus-guild) now show Olympus 1.3.3. The older
1.3.2 inspection and native-layout evidence below retain their original scopes. This confirms source adoption and
listed distribution, not downloaded/installed bytes, current supported-client behavior or website admission. The
local compatibility sidecar is an older reference; upstream's TOC `1.3.3-site.1` deliberately retains wire producer
`1.3.2-site.1`. These labels do not authenticate game origin or activate site features.

Olympus Verify's **Discord verification** column sits beside the native Guild & Communities
**Roster** view. The current source version is recorded in the
[Olympus Verify TOC](../addon/OlympusVerify/OlympusVerify.toc). The bounded native-layout
acceptance below belongs to **0.6.9**. The column uses the actual visible member rows, not their screen
positions or a separate alphabetical list. It does not replace Blizzard functions, change native columns,
sort the guild, edit notes, invite, remove members, or send a whisper.

The supported inline layout has `CommunitiesFrame.MemberList.ScrollBox`, native
`GetMemberInfo()` rows and a selected club equal to `C_Club.GetGuildClubId()`. Recycled rows
are repainted and their original name/GUID is checked again at a click. Non-guild clubs and
compact chat lists get no verification column. An unknown legacy/ClassicUI guild layout
has no added native controls unless its visible roster can be identified; `/olv members`
remains available. A visible supported roster without room for the added panel gets
**Verify members**, opening that same Members window with the same status rules.
The opaque 116-pixel panel docks beyond the **whole native Guild window**, with a
48-pixel navigation gutter, and fits against the UIParent screen edge after scale conversion.
Its rows follow the actual native row tops. Hiding the MemberList (for Chat, Info or another
tab) hides both controls. The panel follows the native Guild window's stratum and frame
level instead of imposing `DIALOG`. Opening the source-defined `GuildMemberDetailFrame`
immediately hides both owned controls; they return on the next refresh after it closes.
Native row positions, widths and buttons are never changed. Combat and gamepad mode hide these
extra native-window controls; unsupported or unreadable APIs fail closed. The separate
Members window remains available through `/olv members` out of combat.

## What each status means

The verification column combines the live native roster with dated Watcher lists.
In membership-only mode the Watcher separately reads the latest complete, trusted
export from the configured native guild and realm. It writes the display-only
`OlympusVerifyLists.lua` file beside the retained invitation queue. The addon checks
the current native guild, realm, and exact character GUID before showing a result
or opening a reminder. This file carries no invitation or removal eligibility.
The legacy Watcher mode continues to read the lists from `OlympusQueue`.

The lists and the underlying server roster must have valid dates at most **one
hour** old. The Watcher normally polls the lists every 30 minutes. A failed strict
read leaves any prior display file at its original dates, and the addon holds
strict results if the file is absent, expired, or from another guild or realm.
Refresh the Watcher exchange and reload to obtain newer lists. Reading the guild
roster alone does not refresh the server lists.

- **Verified**: one exact native GUID matches one current `member` link in the loaded list.
  A renamed character can retain its match by GUID. This is a dated display snapshot,
  not a live Discord lookup or new proof of account ownership.
- **Not verified**: the fresh unverified list names that unique current native character,
  and there is no matching or conflicting linked identity.
- **Verifying**: that unverified entry already has an in-progress verification.
- **Unknown**: no list entry, a name-only legacy link, mismatched/reused GUID, duplicate or
  conflicting entries, missing native GUID, or an unknown/changed guild scope. Absence
  from a list is not evidence that a person has not verified.
- **Stale list**: old, missing or future list/roster dates. It does not become “not verified.”

Hover for the reason and available snapshot time. A guild change invalidates the current
session's list scope until reload. No local column changes a Discord role, link or server
verification result. The Members window uses these conservative rules too.

## One member, one editable reminder

Click **Not verified** for an online member in either view. The click rereads that native
member and the lists, then opens the game's whisper editor addressed to the **complete
native name**, including Forever's two-part names. The editable reminder points the recipient
to **Get my code** in Asmongold's **#⚡olympus-verify** channel and asks them to follow the
bot's whisper instructions from that character in game. In membership-only mode the bot can
issue a request code to an unbound Discord account. Completing verification still requires the
current native roster and exact per-whisper membership proof. **The player must press Enter to send it.** There is
no bulk button, timer, automatic send, retry queue, invite or role action. An existing chat
draft is preserved. Offline, pending, unknown and stale members cannot be contacted by
this shortcut. Preview blocks the action without enabling or altering preview mode.

If the exact-recipient editor APIs are unavailable, use the game's whisper UI manually;
the AddOn does not substitute a slash-parsed partial name or send by another API.

## Optional Olympus Guild bridge

The supplied CurseForge link is **Olympus Guild**, project **1708200**, by **dnl_gentile**:

- [CurseForge source link](https://www.curseforge.com/wow/addons/olympus-guild)
- [Upstream repository](https://github.com/dnl-gentile/olympus-addon)
- Publisher version inspected on 26 October 2026: **1.3.2**, commit
  [`d03ea8a9ce8d6d933dde9ce0f0ec7faa866a2df2`](https://github.com/dnl-gentile/olympus-addon/tree/d03ea8a9ce8d6d933dde9ce0f0ec7faa866a2df2),
  [CurseForge file 9273643](https://www.curseforge.com/wow/addons/olympus-guild/files/9273643)
- [Public Bridge.lua](https://github.com/dnl-gentile/olympus-addon/blob/d03ea8a9ce8d6d933dde9ce0f0ec7faa866a2df2/Olympus/Bridge.lua)
- [MIT license](https://github.com/dnl-gentile/olympus-addon/blob/d03ea8a9ce8d6d933dde9ce0f0ec7faa866a2df2/LICENSE),
  copyright (c) 2026 Olympus addon contributors. This optional display integration does
  not bundle or install the upstream AddOn.

The earlier inspection of **1.2.3**, commit
[`f60f18814f2426a5c21f97e207611871a06366b4`](https://github.com/dnl-gentile/olympus-addon/tree/f60f18814f2426a5c21f97e207611871a06366b4),
found no public census snapshot contract. That is a limitation of that inspected version,
not a statement about current 1.3.2.

The optional TOC dependency loads an installed, enabled Olympus first; it does not install
or enable it. The keeper's display integration uses `OlympusBridge.API_VERSION == 1`
and `GetCouncil()`. It does not read `OlympusDB`, private namespace tables, chat history,
messages or private roster caches, register a chat observer, request a census, or add a
network protocol.

`/olv olympus on` explicitly enables a session-only, bounded read of `GetCouncil()`.
`/olv olympus status` reports its availability, council-name count and supplied realm.
`/olv olympus off` disables it; reload also disables it. The copy is limited to 64 plain
names, 80 bytes each, and a 200-byte realm. An unavailable or different API is reported as
unsupported. `OlympusVerifyGuild.OlympusSnapshot()` returns a fresh display-only copy with
its observation time and `censusAvailable = false`. Upstream's hidden-name behavior is
preserved. These hints never affect verification, eligibility, ranks, signing or roles.

This is display compatibility, not a claim that both projects have the same author, share
signed authority, or that a council list is Discord verification.

Official **1.3.2** separately exposes `CENSUS_CHECKPOINT_API_VERSION == 1` and the read-only
`GetCensusCheckpoint()` contract. Its fresh copies contain census aggregates, not member
names, chat or signing keys. That contract is distinct from the older local keeper
`GetCensusSnapshot()` / `olympus-census-v1` consumer and the separate `OLCS2` QR prototype;
the presence of a checkpoint does not make either prototype an official website exporter.

The [optional website exporter proposal, PR #72](https://github.com/dnl-gentile/olympus-addon/pull/72),
was still an **open, unmerged draft** in the 26 October review. It reads the public checkpoint
and proposes a dedicated `OlympusSiteAggregate.lua` SavedVariables file in the same upstream
release package. It does not add `GetCensusSnapshot()` or a QR transport. Local source and
test receipts do not establish publisher adoption, a CurseForge package or supported-client
loading. Website import remains held until separately reviewed publisher adoption and
actual-client acceptance; see [the compatibility candidate](../addon/OlympusGuildCompatibility196/README.md)
and [Army publication](army-qr-publishing.md).

## Signed lists, Link and native ranks are separate

`/oly approved paste` opens the official addon's dialog for an author-signed `HT1` list.
The [author's RSA-2048/e=3/SHA-256 signature](https://github.com/dnl-gentile/olympus-addon/blob/d03ea8a9ce8d6d933dde9ce0f0ec7faa866a2df2/Olympus/Sign.lua)
is distinct from [Olympus Link's Ed25519 peer proofs](https://github.com/dnl-gentile/olympus-addon/blob/d03ea8a9ce8d6d933dde9ce0f0ec7faa866a2df2/Olympus/Link.lua).
The website's [local HT1 helper](approved-guild-helper196.md) cannot establish the addon's
held timestamp, realm or successful in-game application. Pasting an approved list does not
configure the ten native guild ranks or grant a website or Discord permission.

**Held interoperability boundary:** official 1.3.2
[`Core.lua`](https://github.com/dnl-gentile/olympus-addon/blob/d03ea8a9ce8d6d933dde9ce0f0ec7faa866a2df2/Olympus/Core.lua#L844)
fixes Captain/officer authority at native index **1**. The owner's website planning ladder
places **High Council at slot 1** and **Officer at slot 2**. Those are not interchangeable
authority models; publisher compatibility review and actual-client qualification are required
before claiming shared authority. This documentation changes no rank or permission.
Olympus Link remains OFF in the accepted website configuration. Official 1.3.2 ships a
placeholder backend key and disabled Council-authority path; source implementation alone
does not establish active peer verification. The local [B1 browser councillor bridge](councillor-verification.md)
is another separately gated Ed25519 flow, not the HT1 list or official Link key system.

## Slash command ownership

Olympus Guild registers `/oly` and `/olympus`. Olympus Verify therefore always supports
**`/olv browser <original challenge>`**. It does not wrap or replace upstream's command
dispatcher. The old `/oly browser` alias is registered only if the native installation API
positively reports Olympus absent and no upstream dispatcher exists. If installation
status is unknown, use `/olv browser`. The release's browser page emits the collision-free
command; never change the original challenge value while copying it.
`/olv ui` and `/olv panel` both toggle the existing officer panel, just like `/olv`.
The 0.6.8 layout corrected the 0.6.7 in-game navigation overlap. Version 0.6.9 also yields
to the native member-details popup. The later owner acceptance of that layout is described
below; it does not qualify every current-client action. A stale watcher list remains
**Stale list** until its existing authorized sync supplies fresh data; opening a native
detail popup never refreshes it.

## Source and acceptance scope

Native layout/recipient calls were checked against the extracted Forever UI source:
[CommunitiesMemberList.lua](https://github.com/Gethe/wow-ui-source/blob/735496de78ebd30ce816a0637982c556987f258c/Interface/AddOns/Blizzard_Communities/CommunitiesMemberList.lua)
and its host's actual `GuildMemberDetailFrame` in
[CommunitiesFrame.xml](https://github.com/Gethe/wow-ui-source/blob/735496de78ebd30ce816a0637982c556987f258c/Interface/AddOns/Blizzard_Communities/CommunitiesFrame.xml),
and [ChatFrameUtil.lua](https://github.com/Gethe/wow-ui-source/blob/735496de78ebd30ce816a0637982c556987f258c/Interface/AddOns/Blizzard_ChatFrameBase/Shared/ChatFrameUtil.lua).
Runtime detection still decides whether those APIs/layouts are available. The initial
implementation was source-only: it did not install an AddOn, perform a game/provider action,
or supply live visual acceptance. Later, the owner accepted **0.6.9** native navigation,
panel command and member-details placement, as recorded in the
[member-experience .154 handoff](member-experience154-owner-handoff.md#readback-and-acceptance).
The editable exact-recipient reminder remained untested because the loaded lists were stale;
no reminder, roster sync or verification proof was sent during that acceptance. This is
the bounded **0.6.9** layout observation. The owner deferred the later **0.6.13** native QA
until actual world entry. Native acceptance of the current source still requires the exact
selected Forever client and a live session. The prepared preview checklist and the frozen
erasure/B1 evidence retain their original scopes.


## Roster exploration candidate 0.6.30

The candidate replaces cycling buttons with direct dropdowns for verification detail,
native rank, class, presence (all/online/offline), and Member readiness. Search includes
visible native name/rank/class, safe status labels/reasons and known current Discord
text. It does not search hidden account identifiers. Prior records, generic link
review and expired exact-GUID links remain separately filterable while preserving
their conservative base unknown/stale status.

Every data heading sorts its actual field, including native class, original roster
age and recommendation readiness. The direction and deterministic name tie-break
are explicit; empty Discord columns and shared source dates explain why a sort can
leave the order unchanged. Selected-row details keep the full reason, original
query/roster dates, native identity, next step and action-readiness reason visible.
Copy table opens a bounded native edit box containing the current filtered/sorted
TSV fields. It performs no external transmission and excludes codes, request bodies,
proofs and Discord account IDs.

Promotion counts now distinguish native Initiates, currently verified display
Initiates, loaded validated recommendations and actionable exact native targets.
Missing projection/dispatcher is unavailable, not a claim that nobody needs a
promotion. Stale pages, partial discovery, source holds, risk-review rows, original
pending attempts and per-row mismatch reasons remain visible. A known verified
Initiate without an original fresh recommendation is potential only. The sole
hardware promotion dispatcher and its original native checks remain unchanged.

The window reevaluates loaded evidence every five seconds while visible. A changed,
invalid or expired display source triggers one native reclassification; unchanged
phases do not repeatedly rescan native rows. This may use the existing throttled
native roster query, but never Worker HTTP, Sync or ReloadUI. Expired current names
are cleared rather than kept green. This is not a live server-to-addon transport:
Watcher disk updates still require a supported import path, and the separate
reload-free bridge remains unimplemented.

Before native acceptance, use an attended test account with the exact candidate:
check dropdown selection/closure, sorting and ties, copy-box focus/Escape, selected
row identity after recycling, both window styles/scales, gamepad transitions,
expired source repaint and absent/held promotion projections. No review label or
successful delivery receipt authorizes a role, invite, reminder send or promotion.

## Roster and Sync clarification candidate 0.6.31

The **Verified Initiates** shortcut selects current verified native slot-9 rows,
including potential candidates for whom no supported promotion recommendation is
loaded. **Ready to promote (signed)** is a separate readiness dropdown selection.
Only that original recommendation's current exact native target can enable the
existing hardware promotion action. Historical/expired links are not made current
by either filter. Source holds, original attempts and page/scan deadlines remain.

Sync records a local request before calling the normal reload API. The alert,
roster header and Sync tooltip distinguish that request time from the loaded
server query time and original server roster observation. A newer local request
is not an upload acknowledgement, a completed verification or a new source date.
The reload exports pending data; the Watcher processes it afterward, so that same
reload can still load the previous reply. Wait for the Watcher result and use a
later deliberate Sync to load its file. If source dates still do not advance,
inspect the Watcher result; repeated clicks do not establish delivery.

The launch decoder diagnoses incompatible container/page protocols separately
from malformed metadata, native-scope mismatch, stopped scans and compatible
expired advisory data. The preserved November 5 `launch-operations-v1` pages are
both obsolete and incompatible with `officer-operations-v233`; they cannot become
current recommendations through a redraw or by copying new timestamps onto them.
Obtain a genuinely fresh compatible scan through the existing attended workflow.

The promotion producer requires the original link anchor to be an integer,
positive, no later than the server clock and on/after the existing cutoff before
considering it verified. Invalid anchors stay unknown and do not reach Discord
entitlement reads. This adds no link repair or role/promotion action.

The owner put the missing live bridge **on hold on 11 November 2026**. Current
sources expose in-game peer messages and reload-based files, not a supported
external-to-running-Lua receiver. The separate Companion relay is referenced in
the private source manifest but was not found in the checked workspaces or
accessible repository search. Discord's API team also confirms that bots cannot
post into WoW-linked guild channels:
<https://github.com/discord/discord-api-docs/issues/8628>.
No replacement bridge, automatic reload or timer-driven action is introduced.

## Read-only recovery and loaded status candidate 0.6.32

Watcher 0.6.29 can pause an explicitly started read-only promotion scan after a
temporary Discord rate limit and retry the same signed page. It retains the
original snapshot, scan identity, expiry and read allowances. There are at most
two automatic rate-limit retries per page, at least five seconds between reads,
and no request before the reported cooldown. Retries consume the existing
50 discovery-call or 50 explicit-recheck-call allowance; they do not add a new
allowance. A first request refused before any signed page is captured stays held.
Persistent limits, invalid identity/source, denied access, expiry and exhausted
budgets still stop the scan. A process restart never resumes it.

An identical timestamp-only roster export during a cooldown preserves the
original accepted source. A changed roster, scope or explicit Stop cancels the
waiting scan. No POST, verification proof, role effect or unknown mutation is
retried by this read-only recovery. The stopped historical scan recorded before
this candidate is not resumed or rewritten.

The addon describes the **last loaded** scan, coverage and hold reason. A cached
running/waiting result cannot prove the Watcher is still running, and an elapsed
Retry-After cannot make a cached result current. Partial discovery with no
recommendations does not establish that the remaining roster is ineligible.
Refresh view rereads native rows and loaded evidence only. The missing external
ingress remains on hold; disk updates still enter this client at normal reload.

Prior-record labels require current proof against the existing admission cutoff;
dated labels require a newer valid source. Generic account review needs diagnosis
of the underlying link, native GUID, standing and privacy checks. None is cleared
by refreshing, copying timestamps or marking a record verified. Diagnose first,
then use the supported verification/review workflow for the actual cause.

# Guild roster verification and Olympus Guild coexistence

**Publication status checked 28 October 2026:** [upstream PR #72](https://github.com/dnl-gentile/olympus-addon/pull/72)
merged on 26 October as `71bc357c251b49a167821cc0b7f922eb69fa35b6`. Both the public
[GitHub v1.3.3 release](https://github.com/dnl-gentile/olympus-addon/releases/tag/v1.3.3) and the
[official CurseForge listing](https://www.curseforge.com/wow/addons/olympus-guild) now show Olympus 1.3.3. The older
1.3.2 inspection and native-layout evidence below retain their original scopes. This confirms source adoption and
listed distribution, not downloaded/installed bytes, current supported-client behavior or website admission. The
local compatibility sidecar is an older reference; upstream's TOC `1.3.3-site.1` deliberately retains wire producer
`1.3.2-site.1`. These labels do not authenticate game origin or activate site features.

Olympus Verify's **Discord verification** column sits beside the native Guild & Communities
**Roster** view. Current AddOn source is **0.6.13**; the bounded native-layout acceptance below
belongs to **0.6.9**. The column uses the actual visible member rows, not their screen
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

The inputs already exist: the live native roster and the watcher's `OlympusQueue.verified`
and `.unverified` lists. This change does not write the queue, Config.lua or SavedVariables.
Both fetched dates and the underlying server roster date must be present, not in the future,
and at most **one hour** old (the watcher normally polls these lists every 30 minutes).
Refresh the existing watcher exchange and reload to obtain newer lists. Reading the guild
roster does not refresh the server's verification lists.

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
native name**, including Forever's two-part names. It fills an editable reminder linking
to `https://olympus.roachcouncil.com/`. **The player must press Enter to send it.** There is
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
bounded layout evidence, not whole-client acceptance of current **0.6.13**, a protected invite,
publisher exporter adoption or activation of Link/B1. This documentation correction adds
no new test or game observation and leaves the frozen erasure/B1 evidence unchanged.
The owner has deferred current 0.6.13 native QA until actual world entry is available in the
selected Forever client; the prepared preview checklist is not an executed acceptance test.

# Guild roster verification and Olympus Guild coexistence

Olympus Verify **0.6.9** adds a **Discord verification** column beside the native Guild & Communities
**Roster** view. It uses the actual visible member rows, not their screen positions or a
separate alphabetical list. It does not replace Blizzard functions, change native columns,
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
- Inspected version **1.2.3**, commit
  [`f60f18814f2426a5c21f97e207611871a06366b4`](https://github.com/dnl-gentile/olympus-addon/tree/f60f18814f2426a5c21f97e207611871a06366b4)
- [Public Bridge.lua](https://github.com/dnl-gentile/olympus-addon/blob/f60f18814f2426a5c21f97e207611871a06366b4/Olympus/Bridge.lua)
- [MIT license](https://github.com/dnl-gentile/olympus-addon/blob/f60f18814f2426a5c21f97e207611871a06366b4/LICENSE),
  copyright (c) 2026 Olympus addon contributors. No upstream source is bundled or installed.

The optional TOC dependency loads an installed, enabled Olympus first; it does not install
or enable it. Its public `OlympusBridge.API_VERSION == 1` offers `GetCouncil`, `IsHighCouncillor` and a
chat observer registration. It exposes **no public census/member snapshot API**. We do not
read `OlympusDB`, private namespace tables, chat history, messages or private roster caches,
register a chat observer, request a census, or add a network protocol.

`/olv olympus on` explicitly enables a session-only, bounded read of `GetCouncil()`.
`/olv olympus status` reports its availability, council-name count and supplied realm.
`/olv olympus off` disables it; reload also disables it. The copy is limited to 64 plain
names, 80 bytes each, and a 200-byte realm. An unavailable or different API is reported as
unsupported. `OlympusVerifyGuild.OlympusSnapshot()` returns a fresh display-only copy with
its observation time and `censusAvailable = false`. Upstream's hidden-name behavior is
preserved. These hints never affect verification, eligibility, ranks, signing or roles.

This is compatibility with the inspected public API, not a claim that both projects have
the same author, share signed authority, or that a council list is Discord verification.
Actual census import is deliberately unavailable until upstream exposes a suitable public
read-only snapshot API.

## Slash command ownership

Olympus Guild registers `/oly` and `/olympus`. Olympus Verify therefore always supports
**`/olv browser <original challenge>`**. It does not wrap or replace upstream's command
dispatcher. The old `/oly browser` alias is registered only if the native installation API
positively reports Olympus absent and no upstream dispatcher exists. If installation
status is unknown, use `/olv browser`. The release's browser page emits the collision-free
command; never change the original challenge value while copying it.
`/olv ui` and `/olv panel` both toggle the existing officer panel, just like `/olv`.
The 0.6.8 layout corrected the 0.6.7 in-game navigation overlap. Version 0.6.9 also yields
to the native member-details popup; that popup correction still requires an actual client
check after installation. A stale watcher list remains **Stale list** until its existing
authorized sync supplies fresh data; opening a native detail popup never refreshes it.

## Source and acceptance scope

Native layout/recipient calls were checked against the extracted Forever UI source:
[CommunitiesMemberList.lua](https://github.com/Gethe/wow-ui-source/blob/735496de78ebd30ce816a0637982c556987f258c/Interface/AddOns/Blizzard_Communities/CommunitiesMemberList.lua)
and its host's actual `GuildMemberDetailFrame` in
[CommunitiesFrame.xml](https://github.com/Gethe/wow-ui-source/blob/735496de78ebd30ce816a0637982c556987f258c/Interface/AddOns/Blizzard_Communities/CommunitiesFrame.xml),
and [ChatFrameUtil.lua](https://github.com/Gethe/wow-ui-source/blob/735496de78ebd30ce816a0637982c556987f258c/Interface/AddOns/Blizzard_ChatFrameBase/Shared/ChatFrameUtil.lua).
Runtime detection still decides whether those APIs/layouts are available. This is source
implementation only until the owner runs the existing Lua suites and checks the actual
client. No AddOn installation, game action, external message, provider action or live
visual acceptance was performed during this change. The frozen erasure/B1 evidence
packages were not modified or activated.

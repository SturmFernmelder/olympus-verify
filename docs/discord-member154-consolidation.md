# Duplicate chat review — 13 October 2026

Read-only review in the owner's signed-in Edge session. No channels, messages, assignments or permissions were changed.

| Channel | ID | Current observation | Disposition |
| --- | --- | --- | --- |
| Guild chat to retain | `1551253084536049714` | Olympus guild-hearth topic, existing bot introduction, pin notice and a later human post | Keep its ID, history and existing access |
| Extra guild-chat | `1551936354357743716` | Start-of-channel screen, no messages shown, no pins, Threads panel says no threads; empty topic; @everyone View denied, with Quarantine/Muted entries | Preserve as an archive, with no category permission synchronization |
| Extra server-chat | `1551936147788136579` | Beginning-of-server screen, no messages shown, no pins, Threads panel says no threads; empty topic; @everyone View denied, with Quarantine/Muted entries | Preserve as an archive, with no category permission synchronization |

These observations describe what this account could read at review time. They are not an audit of deleted messages, unlisted private threads or inaccessible content. The two extra channels are unused private placeholders, rather than histories that need to be republished into the populated guild chat. Discord has no native operation that merges original message histories while preserving their IDs, authors and dates.

## Owner's exact UI steps

1. Open the [retained guild chat](https://discord.com/channels/236932545793490944/1551253084536049714). Keep it named `guild-chat`. Do not change its member/staff permissions or existing introductions.
2. Open the [extra guild chat](https://discord.com/channels/236932545793490944/1551936354357743716). Recheck its messages, Pins and Threads before making the change. If new content or a different access requirement has appeared, stop and preserve it for review.
3. In Edit Channel → Overview, rename only that extra channel to `guild-chat-legacy`. Set its topic to `Retired duplicate. Use the Olympus guild-chat channel: https://discord.com/channels/236932545793490944/1551253084536049714` and save.
4. Move that exact channel into the existing `archive` category (`480335467385192448`). **Keep current permissions / Do not sync** if Discord offers category synchronization. Moving it must not turn private history into member or public access. Retain @everyone View Deny and the existing Quarantine/Muted entries.
5. Repeat steps 2–4 for [server-chat](https://discord.com/channels/236932545793490944/1551936147788136579), using name `server-chat-legacy` and the same pointer topic. It remains a preserved private placeholder; do not replace Asmongold's general server chat.
6. Reopen both exact channel links. Confirm their new names, archive placement and unchanged View permissions. Confirm the populated `guild-chat` is still under Olympus and the bot's guild-chat binding still names `1551253084536049714`.

No deletion is needed. No messages need copying, webhook recreation or cross-channel publication. Archiving does not override existing retention or deletion rules. The `.154` Worker deployment performs none of these Discord actions.

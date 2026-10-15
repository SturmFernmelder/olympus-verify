# Superseded beta-reset runbook text — preserved 15 October 2026 UTC

Historical evidence only. None of the steps in the literal blocks below is a current instruction or authorization. The owner changed the scope to member/rank roles only; current instructions are in [launch-runbook section 8](../launch-runbook.md#8-beta-member-and-rank-reset-owner-scope-confirmed-14-october-2026).

The first block is the exact section 8 from the pinned combined-source predecessor. The second preserves the exact intermediate ladder V1 correction before the reset procedure was replaced. Their differing native-rank recommendations retain their historical context.

## Combined-source predecessor, exact text

```text
## 8. The end of the beta (from 22 October 2026; the owner's item 8, build .114)

Blizzard gives 21 October 2026 as the beta's last full day and no hour, and the launch as 4 November 2026. the owner's scope,
confirmed through Codex (log 17:42 and 17:57 UTC, 2 Oct): Olympus guild ranks and guild leadership assignments are chosen
again from scratch for the full release; Asmongold's general roles, applications, votes and private records are not
touched. Nothing runs on a timer; every step below is a person's.

1. **Wait until the beta has actually closed.** Do not guess an hour.
2. **Record the closing moment** on the site: Admin → Settings → End of the beta → "The beta closed at" → Record. It must
   be in the past; the reset stays locked until it is recorded.
3. **Reset**: same block → Reset guild leadership → type RESET. The appointed roles become an explicit empty list (the
   default Treasurer appointment does not come back) and the Olympus I-X leadership directory empties. Optionally set a
   notice such as "Guild roles are open again for the full release". Applications, votes, memberships, links, bans and the
   dated log are kept. Suggested window: 22 to 26 October, so that applications and votes for the full release can finish
   before 4 November.
4. **In game**: the Guild Master (the owner, or an approved GM) sets the ranks by hand from the new decisions. The website
   cannot change game ranks; the rank planner only drafts. The in-game ladder decision changed on 3 Oct 2026 (owner
   answer 6: ten ranks, the Treasurer at index 2 right below Officer, no Probation). The current recommended preset is
   already available in `worker/public/static/rank-planner/model.js`; it does not apply live changes. Its permission and
   bank-limit fields remain draft values. Native rank and bank permissions still need the Guild Master's attended review
   and setup; rank order alone does not establish withdrawal rights.
5. **In Discord** (a person with Manage Roles performs this reset): remove Olympus Officer, Olympus Guild Leader,
   Olympus Raid Leader, Olympus Council GM and Olympus Council Officer from everyone who is not kept. The approved bot
   role position is below Olympus Guild Leader and above Olympus Officer. Hierarchy permits managing eligible lower roles
   only with Manage Roles and a reviewed action path; the bot cannot manage Olympus Guild Leader or roles at or above its
   own role. This position is not authorization to reset leadership, grant private-channel visibility or change game ranks
   or bank permissions. Keep the owner and at least one Olympus Guild Leader, and preserve role-authorized access to
   /olympus-admin, /olympus-intros and the officer lookups. New assignments and permission changes remain separate reviews.
6. **Assign the new leaders**: Discord roles by hand, each named person reviewed first (the Council roles only after that
   review), the site's appointed roles in Admin → Settings, the I-X directory in the same place.
7. **Announce once**: a site notice and, if wanted, one staff post in #guild-announcements; no per-member mentions.

Launch-day items that are not part of the reset and still need a reviewed path before 4 November: `LINKS_NOT_BEFORE` (it
is not an activation key, so `scripts/cutover-config.sh` refuses it today) and a cutoff for invite-queue rows made during
the beta (an invite to a beta name would reach whoever holds that name on live).

```

## Ladder V1 intermediate candidate, exact text

```text
## 8. The end of the beta (from 22 October 2026; the owner's item 8, build .114)

Blizzard gives 21 October 2026 as the beta's last full day and no hour, and the launch as 4 November 2026. the owner's scope,
confirmed through Codex (log 17:42 and 17:57 UTC, 2 Oct): Olympus guild ranks and guild leadership assignments are chosen
again from scratch for the full release; Asmongold's general roles, applications, votes and private records are not
touched. Nothing runs on a timer; every step below is a person's.

1. **Wait until the beta has actually closed.** Do not guess an hour.
2. **Record the closing moment** on the site: Admin → Settings → End of the beta → "The beta closed at" → Record. It must
   be in the past; the reset stays locked until it is recorded.
3. **Reset**: same block → Reset guild leadership → type RESET. The appointed roles become an explicit empty list (the
   default Treasurer appointment does not come back) and the Olympus I-X leadership directory empties. Optionally set a
   notice such as "Guild roles are open again for the full release". Applications, votes, memberships, links, bans and the
   dated log are kept. Suggested window: 22 to 26 October, so that applications and votes for the full release can finish
   before 4 November.
4. **In game**: the Guild Master (the owner, or an approved GM) sets the ranks by hand from the new decisions. The website
   cannot change game ranks; the rank planner only drafts. The in-game ladder decision changed on 3 Oct 2026 (owner
   answer 6: ten ranks, the Treasurer at index 2 right below Officer, no Probation). **That native-Treasurer recommendation
   is superseded.** The owner reconfirmed on 14 October 2026 that the current ten-rank ladder is Guild Master, High Council,
   Officer, Officer Alt, Raid Leader, Veteran, Raider, Member, Alt, Initiate. Treasurer and Co-Guild Master are appointments,
   not native ranks. The current recommended preset is
   already available in `worker/public/static/rank-planner/model.js`; it does not apply live changes. Its permission and
   bank-limit fields remain draft values. Native rank and bank permissions still need the Guild Master's attended review
   and setup; rank order alone does not establish withdrawal rights.
5. **In Discord** (a person with Manage Roles performs this reset): remove Olympus Officer, Olympus Guild Leader,
   Olympus Raid Leader, Olympus Council GM and Olympus Council Officer from everyone who is not kept. The approved bot
   role position is below Olympus Guild Leader and above Olympus Officer. Hierarchy permits managing eligible lower roles
   only with Manage Roles and a reviewed action path; the bot cannot manage Olympus Guild Leader or roles at or above its
   own role. This position is not authorization to reset leadership, grant private-channel visibility or change game ranks
   or bank permissions. Keep the owner and at least one Olympus Guild Leader, and preserve role-authorized access to
   /olympus-admin, /olympus-intros and the officer lookups. New assignments and permission changes remain separate reviews.
6. **Assign the new leaders**: Discord roles by hand, each named person reviewed first (the Council roles only after that
   review), the site's appointed roles in Admin → Settings, the I-X directory in the same place.
7. **Announce once**: a site notice and, if wanted, one staff post in #guild-announcements; no per-member mentions.

Launch-day items that are not part of the reset and still need a reviewed path before 4 November: `LINKS_NOT_BEFORE` (it
is not an activation key, so `scripts/cutover-config.sh` refuses it today) and a cutoff for invite-queue rows made during
the beta (an invite to a beta name would reach whoever holds that name on live).

```

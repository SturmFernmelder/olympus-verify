# Moving Olympus into an existing Discord server — runbook

Written 20 September 2026 against build `.25`. Covers the Olympus server -> Asmongold server move. Phase A is
read-only and commits to nothing; stop after it if the answer is "not yet".

## A. Map what exists (safe, do this first)

1. From `olympus-verify\worker`, run `python ..\tools\guild-map.py`. Output lands in `tools\out\guild-map.md`.
2. Read three things in it:
   - **What this bot can do here.** If Manage Roles is "no", or the "cannot touch N roles" list contains the roles
     it needs to grant, nothing else in this runbook will work until that is fixed.
   - **Config wiring.** Every id in `wrangler.toml` resolved against the live server. All nine should say `ok`.
   - **Counts.** Compare the role/category/channel counts against what Discord shows you. `GET /guilds/{id}/channels`
     returns what the bot can see; a shortfall means private channels are missing from the map.

## B. Prerequisites — decisions, not actions

3. **Resolve the Discord application flag first.** The app is currently quarantined by Discord's anti-spam system
   (appeal 68472279). Installing a flagged app into a large, high-visibility community is the worst possible
   moment to do it: if the appeal goes badly the problem has moved somewhere far more expensive to unwind.
4. **Confirm Manage Roles and Manage Server in the destination.** Linked Roles are configured per server, under
   Server Settings -> Roles -> Links. Without those permissions this is not a decision, it is a request to whoever
   runs that server.

## C. Build the destination

5. Invite the bot with scopes `bot applications.commands`. Permissions the code actually uses:
   Manage Roles (`addRole`/`removeRole`), Manage Nicknames (`setNickname`, only if `SET_NICKNAME=true`),
   Ban Members (`banMember`), and View Channel + Send Messages + Embed Links for the log and staff channels.
   Combined integer `402672644` — trim it if any of those are not wanted.
6. Recreate the roles from the map. **Managed roles cannot be recreated by hand**; they appear when their
   integration is installed. The map labels them.
7. Drag the bot's own role **above** every role it must grant. A bot can only touch roles strictly below its
   highest one, and this is the single most common reason a working config silently stops granting.
8. Recreate the category, channels and permission overwrites. Watch for channels the map marks
   `inherits category permissions` — Discord shows nothing for that case in its own UI, so they get rebuilt wrong.
   **Member-specific overwrites do not port**: the person must be in the destination server first.
9. Configure the Linked Role: Server Settings -> Roles -> Links, requirement `battlenet_linked = 1`.
10. Map the destination and diff: `python ..\tools\guild-map.py --guild <destination id> --name asmon-map`.

## D. Cut over

11. Edit `worker\wrangler.toml`: `GUILD_ID`, the six `ROLE_*`, the three `CHANNEL_*`. Ten ids.
    `DISCORD_APP_ID` does **not** change — it is the same application.
12. **Re-register the slash commands against the new guild.** They are guild-scoped, so every command silently
    disappears otherwise. `scripts\register.mjs` falls back to a hard-coded `1549537348516188200` when `GUILD_ID`
    is unset, which means forgetting the variable re-registers into the OLD server and looks like success:

        $env:DISCORD_APP_ID="<app id>"; $env:GUILD_ID="<new guild id>"; $env:DISCORD_BOT_TOKEN="<token>"
        npm run register

13. `npm run deploy`.
14. Verify: `GET /health?cb=1` shows the new build (add a cache-buster; the endpoint is cached), then re-run
    `guild-map.py` and confirm all nine config ids read `ok` against the new server.
15. **Backfill the Guild Member role.** `promote()` fires only on the transition into member
    (`if (c && c.status !== "member")`), so everyone already at `status = 'member'` keeps that status, gets no new
    grant, and no future roster pass will ever give them one. They land in the new server with no role.

    Build `.26` adds `GET /admin/backfill-roles` for this. It is **dry by default** — it reports what it would do
    and changes nothing until `&apply=1`. It pages explicitly so a single call can never run away across the whole
    membership, and each response carries the `next` URL to call.

        curl -H "Authorization: Bearer <watcher token>" "<base>/admin/backfill-roles"
        curl -H "Authorization: Bearer <watcher token>" "<base>/admin/backfill-roles?apply=1&limit=25"
        # then follow the `next` field until `finished` is true

    It skips anyone who already holds the role, so re-running is safe. People not yet in the new server are
    reported as `notInServer` rather than failing — run it again later and they get picked up. A 403 stops the
    pass immediately, because that almost always means the bot's role sits below the Guild Member role and every
    remaining row would fail the same way.

    Do **not** do this by resetting `characters.status` in SQL: that replays welcome notifications, audit rows and
    log lines for the entire membership, and loses `member_since`.

## E. Verify and announce

16. End to end with one account: `/verify <character>`, confirm the code, confirm the role and nickname land.
17. Announce, and keep the old server up until step 16 passes.

## Rollback

Swap the ten ids back, re-run `npm run register` with the old `GUILD_ID`, redeploy. Nothing in D1 needs touching:
`members` is keyed on Discord user ids, which are global, and role grants live in Discord rather than the database.

## Unaffected by all of this

The watcher, the addon, the roster export and the invite queue never see a Discord guild id — they deal only in
character names. No restart, no `/reload`, no config change on that side.

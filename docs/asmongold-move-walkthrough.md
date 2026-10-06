# Moving Olympus to Asmongold's Discord — plain-English walkthrough

> Local paths below are examples. Replace `C:/path/to`, `C:\path\to` or `<your-user>` with your own checkout or account before running a command.

Written 20 September 2026. Follow top to bottom. Parts 1 and 2 change nothing and can be done today. Nothing is
irreversible until Part 4.

Three pieces make up the system, and it helps to know which is which:
- **The Worker** — code running on Cloudflare's servers. It talks to Discord. This is what `npm run deploy` updates.
- **The watcher** — a Python program in a black window on your PC. It reads WoW's files and talks to the Worker.
- **The addon** — the Lua code inside WoW that shows the invite panel.

Only the Worker knows or cares which Discord server we are in. The watcher and addon deal purely in character
names, so **nothing in this document requires touching WoW or restarting the watcher.**

---

## Part 1 — Update the Worker and look at what you have (about 10 minutes, safe)

### 1.1 Open PowerShell in the right folder

Open File Explorer, go to `C:\path\to\olympus-verify\worker`, click the address bar at
the top, type `powershell`, press Enter. A blue window opens already pointing at that folder.

### 1.2 Update the Worker

Type this and press Enter:

    npm run deploy

Wait for it to finish. Near the bottom you want to see `Uploaded olympus-verify` and `Current Version ID:`.
If it says `Authentication error` or `code: 7403`, your Cloudflare login expired — run `npx wrangler login`,
finish in the browser, then run `npm run deploy` again.

### 1.3 Confirm the new version is live

    curl.exe "https://olympus-verify.roach-council.workers.dev/health?cb=1"

Use `curl.exe` with the `.exe` on the end. Plain `curl` in PowerShell is a different command and will confuse you.

In the wall of text look for `"build":"2026-09-20.26 role-backfill"`. If it shows an older build, change `cb=1` to
`cb=2` and run it again — that number only exists to stop your browser or the network handing you a stale answer.

### 1.4 Produce the server map

    python ..\tools\guild-map.py

It prints a summary line, then tells you where it wrote two files. Open this one:

`C:\path\to\olympus-verify\tools\out\guild-map.md`

Any text editor works. It is a plain text file.

### 1.5 Read three things in that file

**"What this bot can do here"** — near the top. The line that matters is the one naming the Guild Member role and
its position, ending in **can grant it** or **CANNOT GRANT IT**. A bot can only hand out roles sitting *below* its
own in the list, and that single fact decides whether verification works at all.

This is also the first thing that breaks after a move, and it breaks silently. Role *ids* get carried across in
the settings file; role *positions* do not. In a new server the bot starts at the bottom of the list, so you have
to drag its role up by hand — and nothing anywhere will tell you that you forgot. This line will.

The "cannot manage N roles" line below it is normal. The bot does not need to manage your staff roles; it only
needs to be above Guild Member.

**"Config wiring"** — a table of the nine settings that point at roles and channels. Every row should say `ok`.
A row saying **MISSING** means the settings file points at something that no longer exists.

**The counts** at the top — roles, categories, channels. Compare them to what you see in Discord. If the file shows
fewer channels than you actually have, the bot cannot see some private ones, and the map is incomplete.

### 1.6 Rehearse the role backfill

You need one password-like string first. Open:

`C:\path\to\olympus-verify\watcher\config.json`

Find the line starting `"watcher_token"`. Copy the value between the quotes. **Do not paste it into a chat, an
email, or anywhere public.** It is a key to your own Worker.

Now run this, replacing `PASTE_TOKEN_HERE` with what you copied (keep the quotes):

    curl.exe -H "Authorization: Bearer PASTE_TOKEN_HERE" "https://olympus-verify.roach-council.workers.dev/admin/backfill-roles"

This changes nothing. It is a preview. You are looking for:

- `"alreadyHad"` — people who already have the Guild Member role. Should be roughly your current member count.
- `"wouldGrant"` — people who *should* have it but don't. Today this should be **0 or very close to 0**.
- `"notInServer"` — linked people who have left the Discord. A few is normal.

If `wouldGrant` is a big number right now, stop and tell me. That would mean people are missing their role today,
which is a live problem and not a migration one.

**Part 1 is finished.** Nothing has changed except the Worker being one version newer.

---

## Part 2 — Two decisions before anything moves

### 2.1 The Discord ban on our app has to be lifted first

Discord's automatic anti-spam system has flagged our app. Right now that blocks Battle.net linking completely
(33 people tried in half an hour recently; none got through). We have appealed — ticket 68472279.

**Do not install a flagged app into Asmongold's server.** If the appeal goes badly, the problem lands in a much
bigger, more visible place and is much harder to undo. Wait for the appeal.

### 2.2 Check whether you can actually do this

In Asmongold's Discord, click the server name at the top-left, then **Server Settings**. If you can open the
**Roles** page and see an **Integrations** page, you probably have what you need.

You need two permissions: **Manage Roles** and **Manage Server**.

If you do not have them, stop here. This is not something you can do alone — it needs whoever runs that server.
Ask me and I will write the message to send them.

---

## Part 3 — Build the new home (only after Part 2 passes)

Everything here happens by clicking in Discord. Discord moves its menus around occasionally, so if a menu name
does not match exactly, look for something close by.

### 3.1 Add the bot to Asmongold's server

Go to the Discord Developer Portal, open the olympus-verify application, then **OAuth2** -> **URL Generator**.

Tick these two scopes: `bot` and `applications.commands`.

Then tick these permissions: **Manage Roles**, **Manage Nicknames**, **Ban Members**, **View Channels**,
**Send Messages**, **Embed Links**.

Copy the generated link at the bottom, paste it into your browser, choose Asmongold's server, approve.

### 3.2 Put the bot's role high enough

**Server Settings -> Roles.** You will see a vertical list. Drag the bot's role (named after the app) so it sits
**above** the Guild Member role you are about to create.

This matters more than it sounds. A bot can only give out roles below its own. If it sits too low, everything
looks configured correctly and simply never works.

### 3.3 Recreate the roles

Open your `guild-map.md` from step 1.4 and find the **Roles** table. Recreate them in Asmongold's server, top of
the list first.

Two warnings from that table:
- Roles marked **managed** cannot be created by hand. They belong to another app or to Nitro boosting and appear
  on their own when that thing is installed. Skip them.
- The role names in bold have **Administrator**, which overrides everything else. Be deliberate about those.

### 3.4 Recreate the category and channels

In the **Channels** section of `guild-map.md` you will see each category and the channels inside it, with their
permissions written in plain words like `@everyone: deny VIEW_CHANNEL`.

Right-click in the channel list -> **Create Category**, then create channels inside it. To set permissions,
right-click a channel -> **Edit Channel** -> **Permissions**.

Two warnings again:
- Channels marked *inherits category permissions* have **no permissions of their own** — they just follow their
  category. Do not add permissions to these. Discord shows nothing at all for this case in its own screens, which
  is exactly why people rebuild them wrong.
- Lines marked **(member override — does not port)** apply to one specific person, not a role. You cannot set
  these until that person is in the new server.

### 3.5 (Superseded: do not do this) The Battle.net requirement

This walkthrough was written for build .25 (20 Sep 2026). Since build .32 the in-game whisper is the proof of control and
Battle.net is optional; since .114 (2 Oct 2026) Battle.net sign-in is switched off. A `battlenet_linked` requirement on
Guild Member would make the role impossible to get. Leave the role's **Links** tab empty. Codex checked on 2 Oct 2026
that Olympus Guild Member in Asmongold's server has no such requirement (log 18:58 UTC).

### 3.6 Write down the new ID numbers

For each of the six roles and three channels you just made, right-click it and choose **Copy ID**.

If you do not see "Copy ID", turn on Developer Mode first: **User Settings** (the gear by your name) ->
**Advanced** -> **Developer Mode** on.

Also copy the server's own ID: right-click the server name -> **Copy Server ID**.

Paste all ten into a text file with labels. Send them to me and I will make the settings changes for you.

---

## Part 4 — The switch (about 15 minutes; this is the part that is real)

Do this at a quiet hour, not during a raid.

### 4.1 I change the settings file

Send me the ten IDs from 3.6 and I will update `wrangler.toml`. Do not hand-edit it unless you want to — one
mistyped digit is a very confusing evening.

### 4.2 Re-register the slash commands

`/verify` and the others are registered **to one specific server**. If you skip this, every command silently
vanishes.

Still in the `worker` folder. You need the bot token for this one — Developer Portal -> your app -> **Bot** ->
**Reset Token** if you do not have it saved. Type these two lines, one at a time:

    $env:DISCORD_APP_ID="1550176895671341076"; $env:GUILD_ID="PASTE_NEW_SERVER_ID"; $env:DISCORD_BOT_TOKEN="PASTE_BOT_TOKEN"

    npm run register

It should print `registered N guild commands in <your new server id>`. **Check that ID in the output.** If you
forget to set `GUILD_ID`, the script quietly falls back to the old server and still prints success.

### 4.3 Deploy

    npm run deploy

### 4.4 Check it landed

    curl.exe "https://olympus-verify.roach-council.workers.dev/health?cb=3"

    python ..\tools\guild-map.py

Open `guild-map.md` again. All nine rows in the **Config wiring** table should now say `ok` and name your new
roles and channels. Any MISSING row is a wrong ID — fix that before going further.

### 4.5 Give everyone their role back

This is the step that would otherwise quietly break everything. Existing members keep their "member" status in our
database, but the role itself lives in Discord and does not follow them. Nothing in the normal day-to-day would
ever notice or fix it.

Preview first — this changes nothing:

    curl.exe -H "Authorization: Bearer PASTE_TOKEN_HERE" "https://olympus-verify.roach-council.workers.dev/admin/backfill-roles"

Look at `wouldGrant`. That is how many people are about to get their role back. If the number looks sane, do it:

    curl.exe -H "Authorization: Bearer PASTE_TOKEN_HERE" "https://olympus-verify.roach-council.workers.dev/admin/backfill-roles?apply=1&limit=25"

It works 25 people at a time. At the end of the output there is a `"next"` line with a web address. Run the same
command again with that address until you see `"finished": true`.

If it stops and says something about **403**, the bot's role is sitting too low — go back to step 3.2, move it up,
and run it again. Running it more than once is safe; it skips anyone who already has the role.

---

## Part 5 — Check it actually works

1. In Discord, in the new server, type `/verify` followed by one of your character names. You should get a code
   back, visible only to you.
2. Check that the Guild Member role and your in-game nickname were applied.
3. Look at your log channel for a line about the verification.

If all three work, announce the move. **Keep the old Olympus server running until then.**

---

## If something goes wrong

Everything is reversible. To go back: tell me and I will restore the old IDs in the settings file, you re-run
step 4.2 with the **old** server ID, then `npm run deploy`.

Nothing in the database needs undoing. Member records are keyed to Discord *account* IDs, which are the same
everywhere, and roles live in Discord rather than in our data.

## Things that are NOT affected, so do not worry about them

The WoW addon, the watcher window, the invite queue, the roster export, everyone's verification codes, and the
1000-member cap in game. None of them know which Discord server we use.

# Olympus Verify — security runbook

Internal runbook for the owner (Viktor) and the two agents (Claude Code, ChatGPT Codex). Report a suspected issue to
Viktor directly; never paste secret values into issues, chat, logs, the coordination logs or commits.

## Where secrets live

| Secret | Stored in | Never in |
|---|---|---|
| `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_SECRET`, `COOKIE_SECRET`, `BNET_CLIENT_ID`, `BNET_CLIENT_SECRET` | Cloudflare Worker secrets on `olympus-verify` | Git, GitHub Actions, D1, logs |
| `VERIFY_SECRET` (the HMAC behind every code and signed note) | The Worker secret, `watcher/config.json` on the officer's PC and `addon/OlympusVerify/Config.lua` in the game client: three copies that must match | Git (all three paths are ignored), the coordination logs |
| `WATCHER_TOKEN` (bearer for `/ingest/*`, `/queue*`, `/admin/*`) | The Worker secret and `watcher/config.json` | Git |
| Cloudflare access | Wrangler's OAuth login on the owner's machine (`npx wrangler login`) | Git or GitHub: deploys are manual, from an exact commit |
| GitHub push credential | Git Credential Manager on the owner's machine | The repository |

Public identifiers (the Discord application id, server, channel and role ids, the D1 database id) are in
`worker/wrangler.toml` on purpose; they are not secrets. `worker/.dev.vars.example` is a template with empty values.

The whole project folder is synced by OneDrive, so `watcher/config.json` and `Config.lua` are replicated to the cloud
along with it (noted 18 Sep 2026). That is a deliberate owner choice, not an accident; keep it in mind when granting
anyone access to that OneDrive.

## Checking secrets without revealing them

`GET /health` on the Worker reports, for each secret, only whether it is present. A wrong bot token shows up as a
Discord 401 in `#olympus-log` with the exact fix (`src/discord.ts` `explainDiscordError`); a wrong watcher token as
401s in the watcher's own log.

## Rotating a secret

The owner pastes new values at Wrangler's hidden prompt or into the two local files. Agents never see or type them.
`wrangler secret put` deploys a new Worker version at once with the code that is already deployed.

1. **Discord bot token:** Developer Portal → Olympus Verify → Bot → Reset Token, then `npx wrangler secret put
   DISCORD_BOT_TOKEN` from `worker/`. Every bot call fails with 401 until it is done.
2. **Discord client secret:** Developer Portal → OAuth2 → Reset Secret, then `npx wrangler secret put
   DISCORD_CLIENT_SECRET`. Site sign-in and the Linked Role flow fail until it is done.
3. **Battle.net client secret:** community.developer.battle.net → the Olympus Verify client → Generate New Secret
   (the old one keeps working for a day), then `npx wrangler secret put BNET_CLIENT_SECRET`. Never delete or recreate
   the client: stored account ids depend on it.
4. **`VERIFY_SECRET`:** new value in all three places, in this order: the Worker secret, `watcher/config.json`
   (restart the watcher), `Config.lua` (then `/reload` in game). Codes and signed notes from the old secret stop being
   accepted at the Worker as soon as step one lands; a code shown to a member minutes before is then dead and they
   press **Get my code** again.
5. **`WATCHER_TOKEN`:** the Worker secret, then `watcher/config.json` and a watcher restart. The watcher's outbox
   keeps what it could not post and retries.
6. **`COOKIE_SECRET`:** the Worker secret only. Every signed-in site session and every in-flight OAuth state stops
   working; people sign in again.
7. **Git credential:** revoke it under GitHub Settings → Applications and sign in again.

## If something leaks

- **Bot token, client secret or `WATCHER_TOKEN`:** rotate at once (above). Read `#olympus-log` and the `audit` table
  for role changes and ingests you did not expect.
- **`VERIFY_SECRET`:** rotate at once in all three places. With it, anyone can mint a valid code for any character for
  two UTC days and forge the addon's signed notes; the roster export and an officer's eyes are the backstop.
- **Battle.net data** (account ids, BattleTags): Blizzard's Developer API Terms require notifying Blizzard within 24
  hours of a suspected breach, and rotating the client secret immediately if it was exposed.
- **Discord user data:** follow Discord's Developer Policy; tell affected members if required.

## Restoring the database (D1 Time Travel)

Cloudflare D1 keeps point-in-time history for 30 days. A restore rolls back everything after the restore point:
verifications, invite-queue rows and their officer claims, roster snapshots, site applications and votes, reserved
names, denials, bans and the replay ledger. Treat it as an incident, never as a routine rollback.

1. **Freeze:** stop the watcher on every officer PC (the addon keeps working offline), and deploy nothing.
2. **Export what happened after the restore point** from the current database first: the `audit` rows since then,
   the `invite_queue` and `site_reserved` rows, bans (`members.banned`), site denials, and the whole
   `seen_interactions` table.
3. **Restore**, then before the watcher comes back: merge the exported `seen_interactions` ids back in (a signed
   interaction stays valid for five minutes; the ledger is what refuses its replay), re-apply the exported bans and
   denials, and check the newest `roster_snapshots` row against the addon's SavedVariables so the next export is not
   refused as "older than the last snapshot".
4. **Resume:** start the watcher; check `/health`, `#olympus-log` and `/olympus-admin queue`.

Never promise that every physical copy is erased immediately: the D1 history expires by itself after 30 days.

## Deploying

Deploy only a reviewed, committed snapshot that both agents signed in the task log:
`bash scripts/deploy-commit.sh <sha>` from the repository root (it exports the commit and runs the project's own
wrangler against that export, so the working folder is never uploaded). Then read `/health`: it must name the build
of that commit.

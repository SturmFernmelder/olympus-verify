# Beta test plan — what only the Forever beta client can answer

Run these on the beta client before anything goes near real applicants. Each item names the file it changes if the
answer is not the assumed one. **Results from 17 Sep 2026** (build 1.60.1.69893, character Fern Melder on "Classic Beta
PvP 2", probe addon `addon/OlympusProbe`, raw SavedVariables (sessions 1–3) kept in `docs/probe-results/`) are in the last section.
Items 11 and 12 were added on 18 September with the addon 0.3.0 changes and still need a live run.

| # | Question | How to check | Assumed | If different |
|---|---|---|---|---|
| 1 | What does the `CHAT_MSG_WHISPER` sender look like for a two-part, realmless Forever name? | `/run local f=CreateFrame("Frame") f:RegisterEvent("CHAT_MSG_WHISPER") f:SetScript("OnEvent",function(_,_,m,s) print("["..s.."]") end)` then whisper yourself from a second account, or have a guildmate whisper | `First Last` or `First Last-Something` | adjust `normalizeCharacter` in all three implementations (keep them identical) and regenerate `vectors.json` |
| 2 | Does one hardware event fire several `C_GuildInfo.Invite` calls, or only the first? | queue two test entries (`OlympusQueue.lua` by hand), press the flush key, watch for `ADDON_ACTION_BLOCKED` | all queued invites fire on one press | make `OlympusVerify_Flush` fire one per press and show the remaining count |
| 3 | Is `C_GuildInfo.SetNote` allowed from the flush key, and is the public note still 31 characters? | after a test invite is accepted, press flush; check the roster note | works; `D:` + 18 digits fits | drop the note (`SET_GUILD_NOTE=false`) — the Worker keeps the mapping anyway |
| 4 | How often does `Logs\WoWChatLog.txt` flush while playing? | whisper the officer, `type Logs\WoWChatLog.txt` from PowerShell every 10 s | within a minute | rely on the SavedVariables path; tell applicants "after the officer's next reload" |
| 5 | Does `LoggingChat(true)` persist across sessions on this client? | relog, `/olv` shows "chat logging on" | yes | the addon re-enables it at login anyway (it does) |
| 6 | `GetGuildRosterInfo` return order and the GUID position on this build | `/run print(select(17, GetGuildRosterInfo(1)))` should print `Player-…` | Classic order (guid at 17) | fix `ExportRoster` and `RosterEntry` |
| 7 | Does `GetInboxText` work without the mailbox frame being visible? | not needed — the addon only scans while `MAIL_SHOW` is active | scanning needs the mailbox open | none |
| 8 | Is `SendChatMessage(..., "WHISPER")` from an event handler still unrestricted? | valid whisper → the reply arrives | yes (DBM precedent) | reply only from the flush key; the code still queues |
| 9 | Bindings: does `Bindings.xml` register under AddOns → Olympus Verify? | Key Bindings menu | yes | check the TOC Interface number; the client ignores addons flagged out-of-date unless "Load out of date AddOns" is on |
| 10 | `Interface:` number the beta client expects | `/run print((select(4, GetBuildInfo())))` | `11509`-ish | edit `OlympusVerify.toc` |
| 11 | Does a line the addon writes itself come back out of `WoWChatLog.txt`? | `/olv logtest` on the officer's client, then watch the file | the marker line appears within a few seconds, after the flush toggle | the chat log is not carrying the addon's own lines, so the signed join confirmation cannot be relied on — keep joins on the SavedVariables path (`origin=addon`) and check `flushLog` in `Config.lua` |
| 12 | Does a roster export with `SetGuildRosterShowOffline(true)` carry the whole guild? | `/olv roster`, then compare the exported member count with `GetNumGuildMembers()` — the total, not the online count | the two match | `ExportRoster` is still reading the displayed roster; leave automatic removals off until they agree, since the Worker would read the gap as a mass departure |

## Results, 17 Sep 2026 (beta build 1.60.1.69893)

| # | Result | Consequence |
|---|---|---|
| 1 | Whisper sender is `First Last` — a space, no realm suffix, even from a sender on the other realm ID (`Player-4619-…` vs the officer's `Player-4613-…`). `UnitName`, `GetUnitName(unit, true)` and the roster agree. `GetRealmName()` = "Classic Beta PvP 2", `GetNormalizedRealmName()` = "ClassicBetaPvP2". 18th chat-event argument is a new `discordInfo` table. | none — `normalizeCharacter` keeps the space; `BaseName` is a no-op |
| 2 | `C_GuildInfo.Invite` from a typed command: allowed (server: `"Olympusprobe9x" not found.`); from a timer: `ADDON_ACTION_BLOCKED`. **One per press:** `/olp multi` (three invites in one press, run twice at 21:46:25 and 21:46:29) — the first reached the server each time, the second and third raised `ADDON_ACTION_BLOCKED`. (The `GuildInvite` global was "blocked" in `/olp test` only because it ran second in the same press.) | flush fires one invite per press, shows the remaining count, attaches the server's answer; offline ("not found") and "Guild is full" answers are retried on later presses (5 attempts) |
| 3 | `C_GuildInfo.SetNote` → `ADDON_ACTION_FORBIDDEN` from the key press **and** from the timer; `/olp note` (own GUID, roster index 40, note unchanged, first call of the press, 21:46:20) → `ADDON_ACTION_FORBIDDEN` again. Caveat: Fern's rank has no note permission (`CanEditPublicNote()` = false); a run on an officer-ranked character would close that. | `SET_GUILD_NOTE=false` in `wrangler.toml`; `setNotes = false` in `Config.lua`; the addon switches notes off for the session on the first refusal; D1 remains the mapping |
| 4 | `Logs\WoWChatLog.txt` flushes every **48 KiB** of chat text, not on a timer — three writes at 21:18:43, 21:24:10 and 21:31:03 UTC, each exactly 49,152 bytes plus the line that crossed the threshold, each with the file mtime equal to that line's timestamp. | at Olympus's chat volume (~6–9 KB/min) that is a 6–8 minute cadence, and hours at night; so the addon toggles `LoggingChat` off and on two seconds after a confirmed code or a join/leave line to force the write (`/olv flushlog`, and `/olv logtest` to prove it), and the SavedVariables path stays the reliable one. Recorded in `docs/design.md` |
| 5 | `LoggingChat()` was `false` at the 20:35 and 20:59 logins (before it was switched on at 21:13) and **`true` at the 21:27 `/reload`** — the setting survives a reload. Across a full logout: not yet seen. | the addon re-enables it at login anyway |
| 6 | `GetGuildRosterInfo` returns 17 values in the Classic order; GUID is the 17th (`Player-4613-…`). `GetNumGuildMembers()` returned 450/422 at 20:59 and **1000/829 at 21:46** — a round 1000 that stopped growing looks like the member cap, in which case invites answer "Guild is full." until seats are freed; Fern is rank *Initiate* (4) with `CanGuildInvite()` = true and no note permission. | the addon retries "Guild is full." on later presses; the roster-removal side (kicking inactives) is the guild's job, not the bot's |
| 7 | not needed | — |
| 8 | `SendChatMessage(..., "WHISPER")` from a timer was delivered (`CHAT_MSG_WHISPER_INFORM` fired). `C_ChatInfo.SendChatMessage` has the same four-argument signature. `C_ChatInfo.AreOutgoingAddonChatMessagesRestricted()` = true, but Blizzard's documentation says that governs addon comms (`SendAddonMessage`), not chat. `InChatMessagingLockdown()` = false. | none |
| 9 | not tested yet (real addon not installed). | open |
| 10 | `select(4, GetBuildInfo())` = **16001**. `IsPublicBuild`/`IsTestBuild`/`IsBetaBuild` all true; `portal` = `test`; `GetCurrentRegion()` = 90. | `OlympusVerify.toc` lists `16001, 16000, 11509` |
| 11 | added 18 Sep with `/olv logtest`; not run yet. | open |
| 12 | added 18 Sep with `SetGuildRosterShowOffline(true)`; not run yet. The 17 Sep probe measured 450 members against 422 online, which is the gap this closes. | open |
| 13 | **Is `C_GuildInfo.Uninvite` protected?** Both `C_GuildInfo.Uninvite(name)` and the `GuildUninvite` global exist on the beta client (probe, 17 Sep) but neither was ever called, so the earlier note that removal "is protected like `Invite`" was an assumption, not a measurement. Free a seat from the officer panel (two clicks) and watch for `ADDON_ACTION_FORBIDDEN`: the addon flips `kickForbidden` and says so in the panel if the client refuses addons outright. | the panel keeps ranking candidates either way; only the button stops working, and it tells you to use `/gkick` | open |
| + | `C_GuildInfo.MemberExistsByName(name)` works from a timer. | addon marks accepted invites "joined" every 30 s for 15 min after a flush; watcher relays `joined` events; Worker sets `invite_queue.status='joined'` |
| + | `C_EncodingUtil` has JSON/CBOR/Base64/Hex/compression, no SHA-256/HMAC. | pure-Lua HMAC stays |
| + | Client crash on first launch (four `Errors\*.dmp` at 18:27 UTC): `ASSERTSAFES … Unable to determine locality for BGDL … CAS error` — a data-streaming fault at startup, before any addon code runs. | none for us |

## Discord side (does not need the beta)
1. `wrangler dev` + `cloudflared`/`ngrok` to test the interactions endpoint locally; Discord's PING must return `{type:1}`.
2. `/linked-role` with a Discord account that has a verified Battle.net connection → the role appears within a minute;
   with an account that has none → the "No Battle.net connection found" page; a second account with the same BattleTag →
   refused.
3. `/verify Thrall` twice → same code; from a second account → "already in progress".
4. `curl -H "Authorization: Bearer $WATCHER_TOKEN" -d '{"character":"Thrall","code":"<code from /verify>","source":"whisper"}' https://<worker>/ingest/verify`
   → card in #recruitment-review (review mode) → Approve → `GET /queue` lists it → `POST /queue/written`.
5. `POST /ingest/roster` with a hand-written members list that includes Thrall → Guild Member role + nickname + DM;
   post it again without Thrall → role removed, log line in #server-log.
6. `/olympus-admin roster` shows guild members with no verification (expected: everyone, on day one).

## Worker .115 manual checks (3 Oct 2026; Discord and the site, no beta client needed)

The suites cover each of these against the real Worker; these are the checks a person makes once on the live service,
with a test account or as an administrator, when the situation arises (a full guild, a distrusted export) or after the
owner switched News on. None is a deploy gate; the ones not made are named as residuals.

| # | Check | Expected |
|---|---|---|
| 1 | `/verify-status` and Home for an account with a queued character, while the latest trusted export reads 1000 | one "Olympus I is full" paragraph with the export's hour and "1000 of 1000", the account's own place ("#N in line"), the visitors line; ephemeral, no notice, no DM; a confirmed member with nothing queued sees no notice on Home |
| 2 | `/olympus-admin queue` and `roster` after a distrusted shrink (an export more than `ROSTER_MAX_SHRINK_PCT` smaller), then `/olympus-admin sync` | before: "Olympus I room: unknown (the latest export is not trusted...)"; sync's reply adds "This export now counts for the seat count."; after: "N seats free" with the export's time |
| 3 | Community → News while it is off, then on (Admin → Settings → News page), as a confirmed and as an unconfirmed member | off: no News tab or card, `/api/news` 404 `news_off`; on: the tab and the page for the confirmed member; the unconfirmed one gets the standing notice and no News request |
| 4 | Admin → News: post, edit, let one expire (1 day), a stale edit from a second tab, and "Retry the same" after deleting | posted and shown as plain text; the edit changes the revision; the expired one disappears at once and the cleanup removes it; the stale edit is refused in words; the retry answers "deleted" and nothing is posted again |
| 5 | The consent box and Name withheld (Admin → Settings appointed roles; the I-X directory) | a new name without the tick is refused with the message and nothing is saved; with it, it saves and the box clears; Name withheld removes the name from the public pages while the role stays appointed; the audit row has role keys and a count, no name |
| 6 | `/olympus-admin sync` while an export is being written, or when the latest snapshot stores fewer member rows than its export listed (when it arises) | "Nothing applied: roster snapshot #N ..." with the stored and listed counts, "No role or link was changed."; nobody loses Guild Member; for the second case the reply names #N, and `/olympus-admin roster` ("Last roster: ... (snapshot #N)") shows when a newer snapshot is stored, after which sync applies it |
| 7 | An export naming one character twice (two characters whose names differ only by case or realm; when it arises) | the export is refused: one server-log line naming the pairs, "nothing was stored and no role or link changed; the last export still stands"; the seat line keeps the last export; after renaming or removing one character of each pair and a new export (`/olv sync`), the export is applied as usual (`docs/launch-runbook.md` section 10) |
| 8 | Admin → News left open for more than 30 days, then a new notice posted from it (when it arises) | refused in words ("a form posts only within 30 days of being opened"), nothing posted; the page reloads with a fresh form, which posts once |

The in-game ladder decision changed on 3 Oct 2026 (owner answer 6: ten ranks, the Treasurer at index 2 right below
Officer, no Probation), and its planner preset and in-game steps come in a later release.

## Cut-over checklist for Phase 3 (retired 1 Oct 2026, Worker .50)
The profile-API path (`/verify-bnet`, `/bnet/start`, `/bnet/callback`, `syncRosterFromApi`) was removed in .50: never
enabled, and it would have left API-derived copies outside the 29-day retention contract (`docs/deploy-checklist.md`,
"Worker .50"). The code is in git before that commit should Blizzard list Forever in the API one day; any revival has to
give every copy it makes the same 29-day clock.

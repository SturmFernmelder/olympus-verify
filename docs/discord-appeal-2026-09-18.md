# Discord application appeal — olympus-verify

**Route:** https://support-dev.discord.com → sign in with the Discord account that owns the application → open a
ticket. This is the developer portal, not normal user support and not the in-app *Settings → Standing* appeal, which
only covers personal accounts.

**Send this only after build `.13` is deployed and the two portal URLs are set.** Every claim below is checkable, and
an appeal that says "already fixed" about something that is not yet live is worse than no appeal at all.

## Before sending

1. Deploy `.13` (`npm test`, the D1 migration, `npm run deploy`, `npm run register`).
2. Developer Portal → General Information: set **Privacy Policy URL** to `https://sturmfernmelder.github.io/olympus-verify-policies/privacy.html`
   and **Terms of Service URL** to `https://sturmfernmelder.github.io/olympus-verify-policies/terms.html`.
   The portal refuses any URL on the `workers.dev` host, so both documents are published on GitHub Pages instead;
   the Worker still serves identical copies at `/privacy` and `/tos`.
3. Developer Portal → set the description to name the single guild the app serves.
4. Numbers are already measured and written into the ticket below: busiest minute = 11 role changes (D1 audit,
   18 September 21:14 UTC); authorization rate ~7/min sustained. Re-run the audit query if you want them refreshed:
   `SELECT strftime('%Y-%m-%d %H:%M', ts, 'unixepoch') AS minute, COUNT(*) AS n FROM audit WHERE action IN
   ('roster.member','roster.left','roster.freed_seat') GROUP BY minute ORDER BY n DESC LIMIT 5;`

## Ticket

**Subject:** Appeal — application flagged for abusive behavior (transactional DM burst, already remediated)

---

Hello,

My application **Olympus Verify** (application ID: `1550176895671341076`) has been flagged with "This application has been
flagged for abusive behavior pending review, and is currently unable to be authorized to any additional servers or
users." I would like to appeal, and I think I know what triggered it.

**What the application is.** It is a private, unverified bot serving exactly one Discord server: the community for a
World of Warcraft guild called Olympus, roughly 1,000 members. It is not public, not listed in any bot directory, and
is installed in no other server. Its only job is to confirm that a Discord account and an in-game character belong to
the same person, so that guild channels can be opened without an officer checking each name by hand.

**What I believe triggered the flag.** I can see two candidates in my own logs and I would rather give you both than
guess.

The first is authorization volume. Our guild grew to about 1,000 members over 17–18 September ahead of a launch, and
members were linking their accounts in bulk over a short period. My server logs currently show roughly seven
authorization attempts per minute sustained, peaking above ten. I appreciate that a new, unverified application
collecting authorizations at that rate, from a standing start, is indistinguishable from token farming without
knowing the context. The context is simply that a thousand people were pointed at the same link in the same week.
(Part of that rate is now self-inflicted: members who hit the flagged-app error retry, which raises the number
further.)

The second is direct messages. The bot sends transactional DMs — your character was confirmed and your role is live,
your character left the guild, your application was decided. Each is tied to one person's own access, and none are
announcements or marketing. They were sent from inside a loop over the guild-roster diff, so a roster change could
send several in quick succession. Querying my own audit log, the largest single minute contained 11 role changes and
therefore at most 11 DMs. I am not claiming that is harmless — unsolicited DMs from an app with no history are exactly
what an anti-spam system should look at — but I want to be accurate rather than dramatic about the size of it.

**What I have already changed.** Every DM in the application now passes through a single rate limiter that counts
messages sent in a rolling 60-second window and drops anything above a cap of five — below the busiest minute the
application has ever had. Dropped messages are logged and
discarded — nothing is queued and nothing retries — so a burst is now structurally impossible rather than merely
unlikely. Each DM also now states why the recipient is receiving it and that the bot only ever messages people about
their own guild access. Every piece of information the DMs carry is separately available on request through a slash
command, so users can close their DMs entirely and lose nothing.

I have also published a Privacy Policy and Terms of Service, at https://sturmfernmelder.github.io/olympus-verify-policies/privacy.html
and https://sturmfernmelder.github.io/olympus-verify-policies/terms.html, and set both on the application.

**One thing I want to flag proactively, in case it contributed.** The application uses Discord Linked Roles, and
because Discord retired Battle.net connections for applications on 22 September 2026, it now confirms a user's
BattleTag through Blizzard's own OAuth instead. Until today, the flow redirected straight from the Discord
authorization callback to `oauth.battle.net`. I realise that a fresh OAuth grant followed immediately by a redirect to
a third-party login form is structurally similar to a credential-phishing chain, even though both endpoints are the
genuine first-party login pages. I have replaced that silent redirect with an interstitial page on my own domain that
names the destination domain, tells the user to check their address bar, and states that the application never sees
their Blizzard password. The application requests only the `identify` and `role_connections.write` scopes from
Discord, and only `openid` from Blizzard.

**What I am asking for.** Please review and lift the restriction so existing members can finish linking their
accounts. I am happy to provide the source, the audit log, or anything else useful. If any of the above is still not
acceptable, I would rather be told what to change than guess.

Thank you for your time.

<NAME>
Owner, Olympus Verify (application `1550176895671341076`)
Discord user ID: `<YOUR DISCORD ID>`

---

## Notes

- Do not create a second application to work around the restriction. That reads as evasion and turns an automated
  flag into an enforcement action against the account behind it.
- Pull the authorization link from `#welcome` and anywhere else it is posted until this clears. Every member who
  clicks it and sees the error is a potential report, and reports compound the flag.
- Expect a slow reply. Do not open duplicate tickets; that resets the queue position.

# Olympus Link in olympus-verify

Build .186, 21 October 2026. **Phase 1a: the source ships OFF.** Nothing in `worker/wrangler.toml` turns it on, no
binding, variable or secret is added, and with Link off every route and every `/verify` reply is byte-identical to
.185. Activation is Phase 2, an owner step after Phase 1b (section 8).

Prepared as .186 and then planned as .190, it was released under neither number and ships with build .194 on top of
.193. The .186 labels below and in the code are kept: ".186" names the first build with Link, which is .194 (.187 to
.193 have no Link), and ".185" names the Worker without Link. The tests pin that the `/proof` and `/api/link/keys` 404s
and every `/verify` reply and main-database statement are what .185 gave, which .187 to .193 left unchanged; other
routes did change in those builds (for example .192's Army page and every build's `/health`).

The corrected .194 candidate of 22 October adds account deletion admission after the completed review of
`0ff5c85bea37a5f6ad38c18cc656875d6a8fbb05`. That head and its receipts remain historical evidence: they do not
qualify the correction. The owner authorized this correction and revised controls, followed by fresh qualification
of .194 and the affected .195 successor. Neither that authorization nor this document enables Link.

Sources: the reviewed integration plan (`renewed-request-2026-10-21/claude-link-186/integration-plan.md`, outside this
repository) and the owner's rulings of 21 October 2026, recorded in section 2.

## 1. What Olympus Link is

Olympus Link is Daniel's way for a player to prove, inside the game, that a character is theirs, and to have the bot
give their Discord account a cosmetic role for it:

1. The player presses **Verify** (or runs `/verify`). While Link is on, the bot's ephemeral reply carries, after the
   unchanged whisper instructions, an Olympus Link code: a line `/oly discord OLC2.…` to paste in the game.
2. In the game, a High Councillor's addon confirms the player's character and guild. The addon packs the
   confirmations into a link (`OLB5~…`), shown as a QR code and a copy box.
3. The player opens Daniel's page (`https://dnl-gentile.github.io/olympus-addon/`), signs in with Discord (this bot's
   application, scope `identify`) and sends the link to this Worker's `POST /proof`.
4. The Worker checks everything (Daniel's link-core: signatures, certificates, the code, the guild, limits), records
   the link in its own database, and gives the zero-permission **Olympus Link** role in `GUILD_ID`.
5. On the same page, **Delete my link** first obtains account deletion admission. A pending proof or an existing
   deletion guard refuses that admission before any role removal. An admitted request removes the role, runs guarded
   Link-data cleanup, and releases its guard only after confirmed outcomes. Daily limits remain, and an uncertain
   deletion can leave a coordination guard indefinitely (section 4).

## 2. The owner's rulings (21 October 2026)

- **Where the role lives:** in Asmongold's server, which is today's `GUILD_ID`, where `/verify` lives. There is no
  separate Link guild and no `LINK_GUILD_ID`; the role is `LINK_ROLE_ID`.
- **Who gets it:** only when the proof is valid **and** the account is not verification-banned **and** its privacy
  subject is active **and** the member holds none of `BLOCKING_ROLE_IDS`. Otherwise promote answers the closest
  existing upstream reason: `not-in-server` when the member is not in the server, and `discord` for every refusal
  (banned, inactive subject, blocking role). link-core only knows those two outcomes of a promote, and the page cannot
  show anything else, so nothing new is added. The actual reason goes to the staff-visible audit row (section 5).
- **Removal:** on the player's own "Delete my link". The corrected .194 flow admits deletion before demotion, then
  removes the role before guarded data cleanup. Removing the role on a ban or an erasure is Phase 1b and is **not**
  implemented in .186.

## 3. Design

| Piece | What it is |
|---|---|
| `worker/vendor/olympus-link/{link-core.mjs,schema.sql,LICENSE}` | Daniel's three files, byte for byte, at `dnl-gentile/olympus-addon@d03ea8a9ce8d6d933dde9ce0f0ec7faa866a2df2` (MIT). Pins and notes: `worker/vendor/olympus-link/README.md`. |
| `worker/scripts/build-link-core.mjs` | Checks the three SHA-256 pins and writes `worker/src/link-core.ts`. `npm run check:link-core` (part of `npm test`) fails on any drift. |
| `worker/src/link-core.ts` | GENERATED, never edited by hand: upstream's text, a header and count-guarded patch groups. **P1** `database()` uses `LINK_DB` only, never `env.DB` (both schemas have a `members` table, and `forgetUser` deletes from it). **P2** error logs print a fixed stage and `errorRef(err)` only. **P3** `discordUser` has no `globalThis.fetch` default; the caller injects `credentialFetch` (no redirects, an 8 s deadline). **P4** keeps a code pending until the role grant is confirmed, so a failed rollback cannot make a later retry report a completed link or use the pending row as authority. The corrected .194 also coordinates proof claims and player deletion through an account guard in the existing `limits` table (section 4). |
| `worker/src/link.ts` | The gate (`linkState`), the narrowed env (`linkEnv`), the `/verify` block (`appendLinkBlock`), the preflight (`linkPreflight`) and the two routes (`routeLink`). It is the only module that loads link-core, by dynamic import, behind the gate. |
| `worker/src/link-role.ts` | The one writer of the Olympus Link role (`linkRole`): eligibility, then `rest()` against `GUILD_ID`. A new module; `roles.ts` and `role-settlements.ts` are untouched. |

link-core only ever sees `linkEnv(env)`: a frozen copy holding `LINK_DB`, the Link settings and `DISCORD_CLIENT_ID`
(mapped from `DISCORD_APP_ID`, upstream's name for the same application id), and **no `DB` key**. Together with P1, Link
cannot reach the bot's database. `src/index.ts` imports only the two route functions and re-exports nothing from Link
(link-core's `LINK` and `PROOF_REASONS` are scalar exports, which workerd refuses in an entry module).

### The flag

| State | Condition | `/verify` | `OPTIONS`/`POST /proof`, `POST /api/link/keys` |
|---|---|---|---|
| **off** | `LINK_ENABLED` absent, `""` or `"false"` | Byte-identical to .185, no added statement | Today's 404 (`not found`), byte for byte |
| **on** | `LINK_ENABLED` exactly `"true"` and the complete configuration below | The Link block appended last | Served |
| **held** | Any other value, or `"true"` with something missing or malformed | As when off; a log line `olympus-link held <where> <setting> error`, at most once a minute per isolate | The preflight answers as when on (204 for the page's origin, 403 otherwise), so the browser sends the POST; `POST` answers `503` JSON `{"reason":"server"}` ("Olympus Link is not available right now."), with CORS on `/proof` for the page's origin |

A browser treats any preflight status other than 2xx as a network error and never sends the POST, which is why a held
Link still answers the preflight: the page then reads the 503 and shows its own words for `server`.

The complete configuration: Native erasure mode (`PRIVACY_NATIVE_ERASURE_ENABLED="true"`, live since .164); `LINK_DB`
bound; `LINK_BACKEND_SEED` (43 base64url characters) and `LINK_BACKEND_PUBLIC` (64 lowercase hex); `LINK_ADMIN_TOKEN`
of 32 characters or more; `LINK_ORIGIN` exactly `https://dnl-gentile.github.io` (one value, no list: any other value
holds Link, and no other origin ever gets CORS from this Worker, held or on); `LINK_MODE` `c` or `a` and
`LINK_GUILD_POLICY` `verified` or `claimed` when set; `GUILD_ID`, `DISCORD_APP_ID` and `LINK_ROLE_ID` snowflakes; a bot
token; and `LINK_ROLE_ID` not one of the roles the bot already writes or protects (`@everyone`, the bot, Guild Member,
the retired membership role, the staff roles, `BLOCKING_ROLE_IDS`, `INTROS_ROLES`, every id named in
`FULL_RELEASE_ROLES` or `QR_NATIVE_ROLE_MAP`, and the fixed beta-reset roles). Optional: `LINK_BACKEND_PREVIOUS`,
`LINK_CA_PUBLIC` (64 hex each when set), `LINK_COUNCIL_CHARACTERS`, `LINK_SITE_TOKEN`.

### `/verify`

Both code replies (`issueCode` with a character, and `issueTicket`: the guide's button, `/verify` without a character
and the old name modal) pass their finished text through `appendLinkBlock`. That runs after the ban checks and after
every main-database statement, so a banned account never gets a Link code and the Link code adds no statement to the
bot's database. The block is upstream's own text: the code and how to paste it, or its one-line reason for
`username` (an old-style Discord name, or no username at all in the interaction) or `limit` (three codes a day). A
failure anywhere (a seed that does not match its public key, `LINK_DB` down, no free code) leaves the whisper reply
unchanged and logs one `errorRef` line; an exception would otherwise become `INTERACTION_FAILED`, which the replay
ledger stores. The code gets 1.2 s (`LINK_CODE_DEADLINE_MS`, up to four `LINK_DB` round trips) inside Discord's 3 s
reply deadline; past that the reply goes out without the block and a `timeout` line is logged, and the next press hands
out the code that landed meanwhile (upstream reuses an open code). A reply that would pass 1,990 characters drops the
block whole; it is never split. Not changed: the already-member reply, `/verify-status`.

### Routes (bot host only, `PUBLIC_BASE_URL`)

| Route | Notes |
|---|---|
| `OPTIONS /proof` | Answered in `fetch` before the policy branch, synchronously, with no database: 204 with upstream's CORS headers and `Access-Control-Max-Age: 600` for `https://dnl-gentile.github.io`; 403 with `Vary: Origin` for any other origin. The same while held. |
| `POST /proof` | Inside `route()`, after `ensureSchema`, before the final 404. Order: another method or origin gets upstream's 405/403 before any body is read and without counting toward any limit; 503 until the bot's schema is ready; an in-memory first filter of 20 a minute per address, an IPv6 address counted by its /64 as upstream's own limit counts it (429 with `Retry-After`); the body read under a 16 KiB cap (413); then upstream's `handleProof` (site token, upstream's own D1 limits before Discord is asked, the Discord sign-in through `credentialFetch`, 10 links an hour per account, the check, the link, the role through `linkRole`). `{"forget": true}` is "Delete my link". The page never gets the Discord id back. |
| `POST /api/link/keys` | Daniel's key tool (`web/FERN.md`). 10 a minute per address (IPv6 by its /64); the bearer is checked first (upstream's constant-time compare of SHA-256 digests; a token under 32 characters never passes), so an unauthorized caller's body is never read; then a 4 KiB body cap and upstream's `manageKeys`. It is not under `/admin/`, which takes the watcher's token. |

On the site host these paths are not Link routes and answer as before. Link is served on the bot host only, so a
shared-host deployment (`SITE_HOST` equal to the `PUBLIC_BASE_URL` host, where `classifyHost` answers `site` first)
serves no Link at all: the member gate answers there, and `route()` checks the bot host again. Not served in .186:
upstream's watcher inbox (`/api/link/inbox`, up to 500 promotes per call) and the same-site routes.

### The role writer (`link-role.ts`)

`linkRole(env, 'PUT' | 'DELETE', discordId)` never throws and answers `{ok: true}` or `{ok: false, reason:
'not-in-server' | 'discord'}`, the shape link-core reads. When link-core gets a failure it attempts to undo the link.
A confirmed undo frees the code. An unconfirmed undo keeps the code pending and cannot report a completed link.

- **PUT**, in order: (1) one main-database read: `members.banned` and the privacy subject's state (no row, or
  `active`, as the house generation fence treats it); (2) `GET /guilds/{GUILD_ID}/members/{id}`: absent (404/10007) is
  `not-in-server`, any `BLOCKING_ROLE_IDS` role refuses; (3) `GET /guilds/{GUILD_ID}/roles`, cached ten minutes per
  isolate and looked at again after any failed PUT: `LINK_ROLE_ID` must exist with permissions `"0"` and not be
  managed, otherwise it fails closed; (4) the PUT, with no sleeping retry on 429. The check sees the role's own
  permissions only, never channel overwrites (section 8, step 5).
- **DELETE** skips eligibility once the player's deletion has been admitted. It reads the privacy subject only to
  fence its audit rows, and goes ahead when that read fails. A role that no longer exists (404/10011) counts as removed.
- A **PUT** that ends without an HTTP status (timeout, abort) keeps the existing one-GET reconciliation and is never
  sent again. A **DELETE** transport failure is unconfirmed even if a GET observes no role: that observation cannot
  prove a queued DELETE has ended. The deletion guard is not released on that outcome, and no DELETE is resent.
- At most four Discord requests and one main-database read per promote (one read per delete); every Discord call goes
  through `credentialFetch`, with the audit-log reason `olympus-verify: Olympus Link`.

## 4. What is stored

### Pending role outcomes (P4, .194 hosted review successor)

The code is claimed with the reserved `codes.used = 0` marker before recording a link or requesting its role.
The marker is finalized to the original Unix-second `t` only after the role writer confirms success. An uncertain
finalization may be checked by one actual readback; neither the UPDATE nor the role PUT is blindly repeated.
`examine` refuses a pending code before the already-linked branch. A pending member cannot authorize a confirmer
or a non-bootstrap key owner. Normal completed links still use an already-linked path without another PUT; the
corrected .194 revalidates the exact code, member and absence of deletion admission in one database snapshot before
using a captured already-linked verdict.

Every `codes.used = 0` marker is retained by prune, including a code no member currently references. An earlier
promotion can still be awaiting its Discord result after a newer link settles; deleting its marker could let a
concurrent player delete erase the only cleanup record before the delayed PUT completes. Ordinary unclaimed and
settled-code expiry keeps its original strict cutoff. Unresolved pending markers may outlive that cutoff and
require explicit keeper review; this is retention and refusal, not completed erasure.

### Account deletion admission (corrected .194 candidate, 22 October)

The completed exact-head review of `0ff5c85` found the opposite ordering to the earlier orphan-role report: a proof's
PUT can finish, player deletion can remove the role and then refuse cleanup because `used = 0`, and the proof can
subsequently finalize and answer `linked` without a role. The old cleanup guard alone did not serialize that ordering,
and its earlier unconditional orphan-role guarantee was overstated. A separate read before demotion would leave a
gap in which another claim could start.

The correction obtains an account guard with one atomic `INSERT OR IGNORE ... SELECT` into the existing `limits`
table, only when that account has no `codes.used = 0` row and no guard already exists. Every new proof claim atomically
requires the same account guard to be absent. If the proof claim wins, deletion refuses before asking Discord to
remove the role; if deletion wins, no proof can acquire a claim while its role and cleanup work run. The guarded
cleanup still checks pending state and admission ownership, with codes last so earlier code-dependent cleanup can
read them. An already-linked answer is revalidated against the current exact code/member and guard in one snapshot;
it does not restore or repeat a role grant. A later concurrent deletion can still follow that read.

The guard key is `delete:<64 hexadecimal digits>`, a domain-separated SHA-256 digest of the account id. It is stable
across backend-key rotation, contains no raw id, and is linkable by anyone who knows an account id: it is a coordination
pseudonym, not a confidential or anonymous rate-limit HMAC. Its `n` is a cryptographically random 52-bit ownership
token and its `until` records admission time, not expiry. There is no TTL, lease takeover or automatic recovery;
ordinary limit pruning explicitly excludes these rows.

Only confirmed role removal followed by acknowledged guarded cleanup permits the final owner-matched guard release
(`k`, `n` and admission time). Missing, failed or thrown acquisition/cleanup results, uncertain role removal and
unconfirmed release answer as errors without automatically repeating role or database work. A guard committed before
an acknowledgement was lost can remain indefinitely, including after account rows were deleted. A lost release
acknowledgement can also follow an actual release: in that case the row is gone, but the old request performs no
further role or cleanup work. This is why release is last. A held guard is not proof that deletion finished, and a
retry does not take it over.

**New activation blocker: indefinite account lockout.** If the deleting request dies or leaves an uncertain outcome
with a retained guard, that account cannot make a new Link claim or complete another Delete my link, even with no
pending code left. A later press, a new code, ordinary prune, and .195's separate one-hour pending-code allowance do
not clear or take over this guard. Normal confirmed release deletes the guard; only retained outcomes have this
indefinite lifetime. There is no implemented player recovery path. This is a new availability, privacy-retention and
recovery blocker for activation of both releases, not an accepted production behavior. OFF publication does not
waive it, and no age-based takeover is authorized.

This coordinates the player's proof-claim and deletion paths; it is not general cross-service atomicity or completed
erasure. Code issuance through `/verify` may run concurrently: its code cannot be claimed while the guard exists,
but a new code issued after the cleanup snapshot can remain. Raw operator `forgetUser` remains a separate maintenance
API and is not qualified for concurrent use. The unchanged PUT reconciliation can still observe absence before a
queued PUT lands; that reasoned late-PUT residual is not solved by this correction. Phase 1b must qualify pending-state
erasure, account copy, guard retention/recovery, prune and raw-maintenance composition, with approved privacy texts,
before activation. No automatic guard repair, role replay or production SQL repair is authorized. Link remains OFF.

This .194 correction does not claim all F1/F2/F3 successor work complete. In .194 every pending marker still blocks
admission without an age bound, and definite lost uniqueness/CAS races retain the existing conservative behavior.
The previously sealed .195 adds its own bounded predicate, second demotion and lost-race changes. Its affected
integration must apply the same bound to both admission and cleanup, hold admission through its second removal,
and be freshly qualified on its actual resulting head; its earlier receipt does not qualify that integration.

Recording a replacement uses an atomic UPDATE matching the examined member's code and linked time; it cannot
overwrite a newer snapshot or reinsert a deleted owned row. Both that UPDATE and a new-character INSERT require the
account's exact pending code claim in the same statement. Undo releases its claim only when the actual resulting
member matches the captured destination, or a newly created character is absent. If another pending replacement
owns the row, undo keeps its own claim pending, so that replacement cannot later restore an unused predecessor.
These checks use existing columns and do not add a schema, timestamp, role resend or background action.

**In `LINK_DB`** (the separate `olympus-link` database; tables from `vendor/olympus-link/schema.sql`):

| Table | Holds |
|---|---|
| `codes` | One row per code: the code `r`, the Discord id and username, mode, draw threshold, issue and expiry times, the signed token (private: it makes each link's tag), the source (`discord`), when it was used. P4 reserves `used = 0` as a pending-state marker, not an event timestamp; only a confirmed grant finalizes it to the original Unix-second observation time. |
| `members` | Linked characters: character, Discord id, guild, how the guild was checked, faction, the linking code, when. |
| `keys` | Confirmer keys registered through `/api/link/keys`: key id, public key, owner's Discord id and username, character, kind, certificate expiry, replacement and revocation. |
| `council_keys` | Council-authority keys seen in an accepted link (unused while `LINK_CA_PUBLIC` is unset). |
| `used` | Which key counted for which code. |
| `inbox_uploads` | The audit trail of every link received (source, code, Discord id, requester, outcome). |
| `revoked_keys`, `revoked_characters` | Revocation lists (key ids and characters only). |
| `limits` | Ordinary rate-limit counters use a keyed hash (HMAC-SHA-256 with the backend seed) of an address, a sign-in or an account. The corrected .194 also stores `delete:<SHA-256 digest>` account coordination guards, a random ownership token and admission time. These linkable pseudonyms have no expiry and are exempt from limit pruning; they are not ordinary HMAC counters. |

An admitted, acknowledged "Delete my link" removes the matching account data in its guarded transaction from
`codes`, `members`, `keys` (their ids move to `revoked_keys`), `council_keys`, `used` and `inbox_uploads`. A refusal
does not complete that cleanup. Ordinary `limits` counters stay until their window ends so deletion never grants more
codes; an uncertain deletion's coordination guard can remain indefinitely. Concurrent code issuance or later
`logProof` audit writes can add data after the cleanup snapshot, so this is not a promise of zero account data at
response time. The upstream forgotten message's "Nothing is kept ... but ... today" is not a complete retention
description for those cases.

**In the bot's database:** nothing new except audit rows, written through the existing `audit()` and only while Link
is on: `link.promote_refused` (`why`: `banned` or `blocking_role`), `link.role_failed` (method, HTTP status, Discord
code) and `link.role_unconfirmed`, whose subject is the Discord id; and `link.role_misconfigured` (`problem`:
`missing`, `managed` or `permissions`), which names no player because it is the server's own configuration. No
message, token or code is stored. Every row that names a player carries `audit()`'s privacy reference: the subject's
generation is read before the effect and the row is inserted only while that generation is still active (the fence
`restore.ts` and `dm.ts` use). A retiring or erased account, or one erased while the call was in flight, never gets a
new row naming it, so nothing is left behind after the erasure's audit cleanup; refusing an inactive account writes no
row at all.

**Elsewhere:** the `/verify` reply that carries the code is kept in the replay ledger (`seen_interactions.response`)
for up to an hour, as every ephemeral reply is. Logs carry fixed texts and `errorRef` categories only.

## 5. Phase 1a limits (by design) and residuals

- **Not in .186 (Phase 1b):** the erasure hook (demote, then forget, inside the Native account erasure), the account-copy
  section, removing the role on a verification ban, the daily prune of `LINK_DB` (expired codes, 90-day trail, ended
  limits) and its placement. Until Phase 1b ships, an account erasure does not reach `LINK_DB`, which is why
  activation waits for it (section 8, step 1). The corrected .194's coordination guards also need account-copy,
  privacy-retention and safe recovery qualification. No automatic removal of a held guard is implemented or approved.
- **New activation blocker: held deletion admission.** An isolate failure or uncertain operation can leave the account
  unable to link or delete indefinitely. Player retry does not clear it; the privacy disclosure and owner recovery
  procedure remain unqualified. The keeper's read-only diagnostic below is not recovery authority.
- Eligibility refusals reach the player as upstream's "Discord did not take the role change: try again in a minute"
  (ruling, section 2). Staff see the real reason in the audit rows.
- `POST /proof` lives on workers.dev, outside the roachcouncil.com zone's WAF; the in-memory filter and upstream's D1
  limits (before Discord is asked) are the flood protection.
- An error raised outside `handleProof` (the Worker's top-level catch, a held write admission, the recovery floor)
  answers without CORS; the page then shows a generic failure.
- A PUT transport failure gets one confirming GET, without a resend. If that GET precedes a queued PUT, the later role
  effect is still possible; this is a reasoned residual, not an ordering guarantee or a reproduced result here.
  link-core has no reconcile job of its own. DELETE transport uncertainty instead holds deletion admission.
- A role given stays until the player deletes the link (no removal on revoke, expiry or later ineligibility). The
  eligibility read, the member read and the PUT are separate steps: a ban or a blocking role that lands between them
  still gets the role, and nothing in Phase 1a takes it away. The Phase 1b ban and blocking-role removal hook closes
  this; it is an activation precondition (section 8, step 1).
- When the role check has passed, a permission or a channel overwrite given to the role later is not seen for up to ten
  minutes (permissions) or at all (overwrites): the role must stay without both (section 8, step 5).
- The `/verify` reply waits up to 1.2 s for the code. A slow `LINK_DB` costs the Link block on that press, never the
  whisper reply; measure it before activation (section 8, step 4).

## 6. Rollback

Remove `LINK_ENABLED` or set it to `"false"`: the routes answer 404 again and `/verify` is byte-identical to .185.
`LINK_DB` keeps its rows. Roles already given stay where they are: nothing removes them, and while Link is off the
player's own "Delete my link" is a 404 too. Remove them by hand in Discord if the rollback is meant to take them away.
Never delete the `olympus-link` database or unbind `LINK_DB` while it holds rows: from Phase 1b on, erasure and the
account copy depend on it. A manual forget for one account against `LINK_DB` is the SQL that Daniel's
`python3 scripts/link-keys.py forget <id>` prints (the same statements as link-core's raw `forgetUser`); the owner runs
it only with Link OFF and requests drained. It bypasses player admission and must not run against fresh in-flight
claims. That SQL does not release coordination guards. A held guard requires a separately qualified owner recovery
procedure that proves old role and database work have ended; neither deleting it because it is old nor assuming a
rollback drained requests is authorized by this document. Keep retained guards with the database during rollback.

### Keeper diagnostic for a held account (read-only, not recovery)

The owner may inspect this single SQL snapshot in a separately authorized read-only LINK_DB context; agents do not
run remote D1 queries. Replace both literals for the same account. The exact key is `delete:` followed by lowercase
hex SHA-256 of the UTF-8 string `olympus-link-delete~<Discord id>`; compute it locally, without a backend secret.
The account literal is the same digits-only id. This query changes nothing and grants no recovery or write authority.

```sql
WITH target(guard_key, discord_id) AS (
  VALUES ('delete:<64 lowercase hex digest>', '<digits-only Discord id>')
)
SELECT
  t.guard_key AS requested_guard_key,
  CASE WHEN g.k IS NULL THEN 0 ELSE 1 END AS guard_present,
  g.until AS admitted_at,
  g.n AS ownership_token,
  c.r AS pending_r,
  c.created AS code_created,
  c.exp AS code_exp,
  c.used AS code_used,
  CASE WHEN c.r IS NULL THEN NULL ELSE
    (SELECT COUNT(*) FROM members m WHERE m.r = c.r)
  END AS member_rows
FROM target t
LEFT JOIN limits g ON g.k = t.guard_key
LEFT JOIN codes c ON c.discord_id = t.discord_id AND c.used = 0
ORDER BY c.exp, c.r;
```

One row is returned per pending code; when none exists the code fields are NULL. `guard_present = 1` identifies a
retained admission row, and `admitted_at` is bookkeeping rather than a safe-release time. No pending code, zero member
references, an old admission time, or an absent guard does not prove that provider or database work has ended or that
deletion completed. The snapshot can also change immediately after the read. Do not treat the ownership token as
authorization to release anything. Recovery must separately establish ended work and qualify the resulting role,
data and privacy state before activation; no mutation query or recovery action is supplied here.

## 7. Tests

`worker/tests/link_integration_186_test.cjs` (in `test:all`): the generator and the pins, including a `--check` run
through a junction or symlink; off is .185 (the routes give today's 404 bytes and statements, the same as any unknown
path; every `/verify` reply and every main-database statement match the .185 `interactions.ts`, rebuilt and
digest-pinned); the gate matrix; `linkEnv` and P1-P3 in behaviour; CORS equal to upstream's for the page's origin and
null for every other one; on: the code block, isolation, the 1.2 s deadline, the length guard, the preflight,
`POST /proof` (link, already, not in server, banned, forget, refused removal, body cap, limit by address and by IPv6
/64, a foreign origin refused before anything is read or counted, schema not ready, no Link on a shared host),
`POST /api/link/keys` (bearer before body, wrong tokens, register, body cap); held (preflight as on, POST 503, the log
throttle); the role writer's eligibility, Discord outcomes and audit fence (no row naming a retiring or erased account,
or one erased mid-call); the upstream vectors (seeds and the derivable token fields left out,
`worker/tests/fixtures/olympus-link/`, SHA-256-pinned) through the adapter; upstream's own seedless D1 cases, ported
(IPv6 /64 limit, the page-wide flood, `LINK_COUNCIL_CHARACTERS` closed by default, `forgetUser` leaving nothing,
`pruneLink`, `PROOF_REASONS`); and the logs. `hosts_test.cjs` adds the three Link modules to its `errorRef` and
no-bare-fetch checks.

For the corrected .194, qualification must also cover the completed review's PUT/DELETE/refusal/finalization ordering,
both atomic admission/claim orderings, an already snapshot invalidated by deletion, token-owned cleanup and release,
lost acknowledgements before and after commit, transport-uncertain DELETE, guard retention through prune, and
concurrent issuance without an admitted proof. The old control that required one DELETE during pending refusal is
intentionally revised to require refusal before role removal. The historical 176-check result at `0ff5c85` does not
qualify those changed controls; exact-head results are recorded separately. This list is a qualification requirement,
not a report that these checks ran or passed.

**Updating upstream.** A new upstream commit is a reviewed change of its own (`worker/vendor/olympus-link/README.md`):
besides this suite, run upstream's own `web/test` suite at the new commit (it needs upstream's seeds and
`web/public/core.js`, which are not vendored here) and record the result with the change.

## 8. Owner activation checklist (Phase 2; not part of .186)

Agents prepare the exact commands; the owner runs them (`CLAUDE.md`: owner gates and the never-run list). Use
`npx wrangler` from `worker/`.

1. **Preconditions.** Phase 1b (erasure, account copy, role removal on a verification ban or a blocking role, prune) is
   shipped and release-qualified, and the privacy texts that describe Link data are approved and published. Phase 1b's
   erasure demote must not depend on `LINK_ENABLED`: `linkRole` refuses everything unless Link is on, so after a
   rollback (section 6) an erasure built on it would never remove the role. Qualify a removal path using the `LINK_DB`
   binding, `LINK_ROLE_ID` and the bot token that remains available after rollback, together with deletion admission,
   pending-state handling and guard recovery. A refused or uncertain demotion is not completed removal, and raw forget
   is not a substitute for that qualification. Account copy and approved privacy texts must include retained guards.
2. **Keys.** From a checkout of Daniel's repository, run `python3 scripts/link-keys.py backend`. It prints a seed and a
   public key once and writes nothing. Keep the seed in a password manager only; the public key (64 hex) is
   `LINK_BACKEND_PUBLIC`. Make the admin token, for example
   `python3 -c "import secrets; print(secrets.token_urlsafe(32))"` (43 characters).
3. **Secrets.** `npx wrangler secret put LINK_BACKEND_SEED` and `npx wrangler secret put LINK_ADMIN_TOKEN`. Each one
   redeploys at once: run them only while the live code contains Link (.194 or later, prepared as .186; .187 to .193
   do not) with `LINK_ENABLED` absent (harmless then).
   Alternatively stage them with `npx wrangler versions secret put <NAME>`, which records the secret in a new version
   without deploying it; confirm that the project's wrangler (4.135.0 today) offers it with
   `npx wrangler versions secret put --help` before relying on it, and verify the staged version before it goes live.
4. **Database.** `npx wrangler d1 create olympus-link --location <the keeper database's location>` (the same location
   hint as `olympus-verify`, so the `/verify` reply's extra round trips stay short; record the printed id), then
   `npx wrangler d1 execute olympus-link --remote --file=vendor/olympus-link/schema.sql`. Record a backup policy for it;
   the existing backup steps cover only the keeper database. Before step 9, measure the `/verify` reply's p95 latency
   with Link on in a staged version: the block is dropped after 1.2 s, so a slow database costs Link codes.
5. **Role.** In Asmongold's server (`GUILD_ID`), create a role **Olympus Link** with no permissions, not managed, below
   the bot's own role. Record its id. The role must never get a permission or a channel permission overwrite: the
   writer checks the role's own permissions (cached up to ten minutes) and cannot see overwrites at all, so a View
   Channel overwrite on a private channel would open it to every linked player.
6. **Developer Portal.** For application `1550176895671341076`, OAuth2: add the redirect
   `https://dnl-gentile.github.io/olympus-addon/` exactly.
7. **Configuration commit (reviewed by both agents).** In `worker/wrangler.toml` **and** `worker/wrangler.cutover.toml`
   (they must stay identical; `scripts/cutover-config.sh --check`), make two separate additions. They go in two places
   on purpose: pasted as one block, TOML would make the variables keys of the `[[d1_databases]]` entry instead of
   `[vars]`, and Link would stay held.

   First, a second `[[d1_databases]]` entry, next to the existing one for `DB` (before `[vars]`):

   ```toml
   [[d1_databases]]
   binding = "LINK_DB"
   database_name = "olympus-link"
   database_id = "<the id from step 4>"
   ```

   Second, these lines inside the existing `[vars]` table, with the other variables:

   ```toml
   LINK_BACKEND_PUBLIC = "<64 hex from step 2>"
   LINK_ORIGIN = "https://dnl-gentile.github.io"
   LINK_MODE = "c"
   LINK_GUILD_POLICY = "verified"
   LINK_ROLE_ID = "<the role id from step 5>"
   # LINK_ENABLED stays absent until step 9
   ```

   `LINK_ORIGIN` must be exactly that value. No `LINK_GUILD_ID` and no `DISCORD_CLIENT_ID` (the adapter maps
   `DISCORD_APP_ID`). Secrets never go in the TOML. Add the marker record the cutover procedure requires. Note in the
   deploy record that `worker/scripts/private-release-evidence-once.cjs` (the dormant configured-mode evidence tool)
   accepts only the `DB` binding of type `d1` and holds on any second one, so it holds once `LINK_DB` exists.
8. **Deploy** that commit with `bash scripts/deploy-commit.sh <sha>`, with the configuration delta stated explicitly
   (baseline plus exactly `LINK_DB`, the named vars and the two secrets) and read back afterwards.
9. **Turn it on:** `LINK_ENABLED = "true"` through a further reviewed configuration commit and deploy. Smoke test from
   `web/FERN.md`: `curl -i -X OPTIONS https://olympus-verify.roach-council.workers.dev/proof -H 'Origin:
   https://dnl-gentile.github.io' -H 'Access-Control-Request-Method: POST'` answers 204 with
   `Access-Control-Allow-Origin: https://dnl-gentile.github.io`; a fake proof answers `login` or `unknown-code`.
10. **Send Daniel** (the owner sends it; agents never send messages): the backend public key (step 2), the `/proof`
    address `https://olympus-verify.roach-council.workers.dev/proof`, the client id `1550176895671341076`, the guild id
    (`GUILD_ID`, Asmongold's server `236932545793490944`) and the role id (step 5).
11. **Councillor keys** once Daniel names the High Council's characters: `POST /api/link/keys` with the admin token
    (`web/FERN.md`); each councillor gets their lines privately.

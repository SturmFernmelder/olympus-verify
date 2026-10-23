# Olympus Link in olympus-verify

Build .186, 21 October 2026. **Phase 1a: the source ships OFF.** Nothing in `worker/wrangler.toml` turns it on, no
binding, variable or secret is added, and with Link off every route and every `/verify` reply is byte-identical to
.185. Activation is Phase 2, an owner step after Phase 1b (section 8).

Prepared as .186 and then planned as .190, it was released under neither number and ships with build .194 on top of
.193. The .186 labels below and in the code are kept: ".186" names the first build with Link, which is .194 (.187 to
.193 have no Link), and ".185" names the Worker without Link. The tests pin that the `/proof` and `/api/link/keys` 404s
and every `/verify` reply and main-database statement are what .185 gave, which .187 to .193 left unchanged; other
routes did change in those builds (for example .192's Army page and every build's `/health`). The corrected-parent
.195 candidate carries forward link-core's generator changes (bounded pending deletion, the second role removal,
lost races that settle and release their code, settled-only answer lists), the Link tests, comments in
`link-role.ts`, the BUILD line and its expected value in the site, hosts and bnet_retention tests, and the docs (this
file, `deploy-checklist.md`, `design.md`). Its actual parent is corrected .194's squash
`9baf5b6d49a0aa6cdd3301c4da5758dcd76e6d39`, not the old sealed .195's `0ff5c85` parent. That old
`14e02bc` / `ac45c989` qualification remains historical and does not qualify this integration. New source, review,
CI and rollout receipts must name the actual resulting .195 head and tree. Link stays off, and the same pins apply: the `/proof` and
`/api/link/keys` 404s and every `/verify` reply and main-database statement are what .185 gave.

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
5. On the same page, **Delete my link** first obtains account deletion admission. A live pending proof or an existing
   deletion guard refuses that admission before any role removal. An admitted request removes the role, runs guarded
   Link-data cleanup, then removes the role again only after cleanup is acknowledged and while its exact guard is
   still held. Exact-owner release is last. Counters and bot-database audit rows remain, and an uncertain
   deletion can leave a coordination guard indefinitely (section 4).


## 2. The owner's rulings (21 October 2026)

- **Where the role lives:** in Asmongold's server, which is today's `GUILD_ID`, where `/verify` lives. There is no
  separate Link guild and no `LINK_GUILD_ID`; the role is `LINK_ROLE_ID`.
- **Who gets it:** only when the proof is valid **and** the account is not verification-banned **and** its privacy
  subject is active **and** the member holds none of `BLOCKING_ROLE_IDS`. Otherwise promote answers the closest
  existing upstream reason: `not-in-server` when the member is not in the server, and `discord` for every refusal
  (banned, inactive subject, blocking role). link-core only knows those two outcomes of a promote, and the page cannot
  show anything else, so nothing new is added. The actual reason goes to the staff-visible audit row (section 5).
- **Removal:** on the player's own "Delete my link". The corrected flow admits deletion before demotion, then
  removes the role before guarded data cleanup; .195 adds a second removal after acknowledged cleanup and before
  final exact-owner release. Removing the role on a ban or an erasure is Phase 1b and is **not**
  implemented in .186.


## 3. Design

| Piece | What it is |
|---|---|
| `worker/vendor/olympus-link/{link-core.mjs,schema.sql,LICENSE}` | Daniel's three files, byte for byte, at `dnl-gentile/olympus-addon@d03ea8a9ce8d6d933dde9ce0f0ec7faa866a2df2` (MIT). Pins and notes: `worker/vendor/olympus-link/README.md`. |
| `worker/scripts/build-link-core.mjs` | Checks the three SHA-256 pins and writes `worker/src/link-core.ts`. `npm run check:link-core` (part of `npm test`) fails on any drift. |
| `worker/src/link-core.ts` | GENERATED, never edited by hand: upstream's text, a header and count-guarded patch groups. **P1** `database()` uses `LINK_DB` only, never `env.DB` (both schemas have a `members` table, and `forgetUser` deletes from it). **P2** error logs print a fixed stage and `errorRef(err)` only. **P3** `discordUser` has no `globalThis.fetch` default; the caller injects `credentialFetch` (no redirects, an 8 s deadline). **P4** keeps a code pending until the role grant is confirmed, bounds only deletion's pending predicate in .195, releases definite lost-race claims and lists settled characters only. **P5** coordinates proof claims and player deletion through an account guard in the existing `limits` table, held through .195's second DELETE; exact-owner release is last, including trusted first-DELETE nonapplication without cleanup. **P6** retains the atomic code/counter quota transaction described below. |

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
`username` (an old-style Discord name, or no username at all in the interaction) or `limit` (the existing three-code
wording, subject to the two windows below). A
failure anywhere (a seed that does not match its public key, `LINK_DB` down, no free code) leaves the whisper reply
unchanged and logs one `errorRef` line; an exception would otherwise become `INTERACTION_FAILED`, which the replay
ledger stores. The code gets 1.2 s (`LINK_CODE_DEADLINE_MS`, up to four `LINK_DB` round trips) inside Discord's 3 s
reply deadline; past that the reply goes out without the block and a `timeout` line is logged. A code that committed
meanwhile still counts even when its answer was lost. A later press can reuse it only for the same username while
more than 12 hours of its life remain; changing the username or reaching that boundary may require another charged
code. Reuse is not a guarantee of delivery or recovery. A reply that would pass 1,990 characters drops the
block whole; it is never split. Not changed: the already-member reply, `/verify-status`.

Code issuance retains both upstream limits: fewer than three **stored** code rows for the account created in the
rolling last 86,400 seconds before another insertion, and an account-hashed counter allowing three charges in its
86,400-second window anchored to its first code. This is not a calendar-day or midnight reset. Deletion removes code
rows but does not reset the counter. Across a counter-window boundary, deletion and fresh issuance can therefore
fit five codes in one rolling 86,400 seconds while each counter window still charges at most three; this is not a
promise of three total issuances in every rolling day. The initial reads can refuse quickly, but the code INSERT rechecks both predicates
inside the same D1 batch as the counter update. The counter changes only when that INSERT inserted a row. A quota
race loser gets the existing `limit` reply without a code; only a complete matching acknowledgement returns a newly
signed token. Missing, malformed or uncertain batch results throw without an automatic issuance retry. A genuine
uniqueness collision rolls the batch back and retains the existing bounded collision retry. Reusing a code remains
uncharged; concurrent requests that all missed reuse may issue distinct codes within the same predicates. An insertion
whose acknowledgement is lost may consume a charge without returning a code. A candidate token
may be drawn before admission, but a denied token is neither persisted nor returned. This quota transaction does
not serialize issuance with deletion or eliminate the later-code and retention residuals below.

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

`linkRole(env, 'PUT' | 'DELETE', discordId)` normally answers `{ok: true}` or `{ok: false, reason:
'not-in-server' | 'discord'}`, the shape link-core reads. A trusted returned DELETE failure can also carry the internal
`notApplied: true` signal described below; it is not a page reason. Core trusts that signal only on a returned object,
never on a thrown error; the adapter itself classifies caught failures before the write-start boundary as known
nonapplication. When proof promotion fails, link-core attempts to undo the link. A confirmed undo
frees the code. An unconfirmed undo keeps the code pending and cannot report a completed link.

- **PUT**, in order: (1) one main-database read: `members.banned` and the privacy subject's state (no row, or
  `active`, as the house generation fence treats it); (2) `GET /guilds/{GUILD_ID}/members/{id}`: absent (404/10007) is
  `not-in-server`, any `BLOCKING_ROLE_IDS` role refuses; (3) `GET /guilds/{GUILD_ID}/roles`, cached ten minutes per
  isolate and looked at again after any failed PUT: `LINK_ROLE_ID` must exist with permissions `"0"` and not be
  managed, otherwise it fails closed; (4) the PUT, with no sleeping retry on 429. The check sees the role's own
  permissions only, never channel overwrites (section 8, step 5).
- **DELETE** skips eligibility once the player's deletion has been admitted. It reads the privacy subject only to
  fence its audit rows, and goes ahead when that read fails. A role that no longer exists (404/10011) counts as removed.
  In .195 the second DELETE runs only after acknowledged cleanup, while the exact admission guard is held, before
  final release. The same nonapplication and uncertainty classification applies to both removals.
  Known pre-request DELETE refusals carry trusted `notApplied: true`, including OFF/held configuration or an invalid
  adapter id, before `write()` may start. After the specific 404 absence cases are handled, DELETE HTTP statuses
  **400, 401, 403, 404, 405 and 429** carry the same signal: the role writer confirms nonapplication. In corrected .194 that first-removal
  refusal keeps the Link data unchanged, releases the exact owned guard once as its last operation, and returns the
  existing `discord` failure. A later explicit player request can try again; no DELETE is automatically retried.
- A **PUT** that ends without an HTTP status (timeout, abort) keeps the existing one-GET reconciliation and is never
  sent again. A **DELETE** transport failure is unconfirmed even if a GET observes no role: that observation cannot
  prove a queued DELETE has ended. Transport errors, 5xx, unlisted statuses such as 408, and bare false/missing
  certainty signals retain the guard and answer held `server`/keeper advice. This is not a blanket 4xx exemption.

- At most four Discord requests and one main-database read per promote (one read per delete); every Discord call goes
  through `credentialFetch`, with the audit-log reason `olympus-verify: Olympus Link`.

## 4. What is stored

### Pending role outcomes (P4, .194 hosted review successor; bounded and settled in .195)

The code is claimed with the reserved `codes.used = 0` marker before recording a link or requesting its role.
The marker is finalized to the original Unix-second `t` only after the role writer confirms success. An uncertain
finalization may be checked by one actual readback; neither the UPDATE nor the role PUT is blindly repeated.
`examine` refuses a pending code before the already-linked branch. A pending member cannot authorize a confirmer
or a non-bootstrap key owner. The page's `linked` and `already` lists exclude pending members using the same
unbounded settled predicate; passing deletion's age bound does not make a proof or authority settled. Normal completed
links still use an already-linked path without another PUT; the
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
table, only when that account has no live `codes.used = 0 AND exp >= live` row and no guard already exists. The
admission, refusal classification and all guarded cleanup writes use the same captured `t` and
`live = Math.floor(t) - LINK.DELIVERY_GRACE - 3600`. Equality is live: deletion may proceed only one second after the
bound. This bound changes no proof, authority, listing or prune rule. Every new proof claim atomically
requires the same account guard to be absent. If the proof claim wins, deletion refuses before asking Discord to
remove the role; if deletion wins, no proof can acquire a claim while its role and cleanup work run. The guarded
cleanup still checks pending state and admission ownership, with codes last so earlier code-dependent cleanup can
read them. An already-linked answer is revalidated against the current exact code/member and guard in one snapshot;
it does not restore or repeat a role grant. A later concurrent deletion can still follow that read.

The guard key is `delete:<64 hexadecimal digits>`, a domain-separated SHA-256 digest of the account id. It is stable
across backend-key rotation, contains no raw id, and is linkable by anyone who knows an account id: it is a coordination
pseudonym, not a confidential or anonymous rate-limit HMAC. For privacy/account-copy treatment it must be treated
as the account identifier, since a dictionary of known ids can recover the association. Its `n` is a cryptographically random 52-bit ownership
token and its `until` records admission time, not expiry. There is no TTL, lease takeover or automatic recovery;
ordinary limit pruning explicitly excludes these rows.

In the .195 player flow, confirmed first role removal followed by acknowledged guarded cleanup permits a second
DELETE while the exact account guard remains held. Only then may the final owner-matched guard release run (`k`,
`n` and admission time). A confirmed second removal (2xx or the specific absent-role 404/10011) permits `forgotten`;
trusted second-removal nonapplication permits final release followed by an honest `discord` answer that data was
already deleted and only a later explicit request may try removal again. Unknown second-removal outcomes keep
admission held and give keeper advice: player retry cannot clear that row. No second removal runs after a missing,
failed or thrown cleanup acknowledgement. The other permitted path is trusted definite nonapplication of the first DELETE
(the six statuses or known pre-request refusals above): cleanup does not run, the exact guard is released once, and the unchanged-data answer
is the existing `discord` failure. An unconfirmed release on either path instead answers held `server`/keeper advice.
Missing, failed or thrown acquisition/cleanup results and role outcomes without a trusted certainty signal do not
release admission or automatically repeat work. A guard committed before an acknowledgement was lost can remain
indefinitely, including after account rows were deleted. A lost release
acknowledgement can also follow an actual release: in that case the row is gone, but the old request performs no
further role or cleanup work. This is why release is last. A held guard is not proof that deletion finished, and a
retry does not take it over.

**New activation blocker: indefinite account lockout.** If the deleting request dies, acquisition/cleanup or release
is unconfirmed, or the DELETE has a transport error, 5xx, an unlisted status or no trusted certainty signal, a retained
guard prevents that account from making a new Link claim or completing another Delete my link, even with no
pending code left. A later press, a new code, ordinary prune, and .195's separate one-hour pending-code allowance do
not clear or take over this guard. Normal confirmed release deletes the guard; only retained outcomes have this
indefinite lifetime. There is no implemented or qualified recovery path. A landed first DELETE can leave linked data without its role;
an isolate death followed by raw forget can leave a role and a held guard. New-code advice cannot repair a retained
guard, and code issuance can itself still consume charges. This is a new availability, privacy-retention and
recovery blocker for activation of both releases, not an accepted production behavior. OFF publication does not
waive it, and no age-based takeover is authorized. A trusted 400/401/403/404/405/429 first-removal nonapplication with
acknowledged guard release, or a known pre-request refusal with that release, is not such a lockout trigger.

The adapter records a `requestMayHaveStarted` boundary immediately before calling its write helper. A caught
DELETE failure before that boundary is known nonapplication; once the helper may have started, a throw cannot
release admission as nonapplication. An ordinary privacy-subject read error is caught inside `deleteReference` and
still proceeds to DELETE. Direct calls composed from an already captured core projection can encounter the
OFF/held or invalid-id preflight; the normal OFF/held HTTP route refuses before entering core. This distinction
does not change route admission or prove a live configuration race. A concurrent second press can also encounter
a guard while the first completes normally; the held message names that possibility without starting a retry.

This coordinates the player's proof-claim and deletion paths; it is not general cross-service atomicity or completed
erasure. Code issuance through `/verify` may run concurrently: its code cannot be claimed while the guard exists,
but a new code issued after the cleanup snapshot can remain. Raw operator `forgetUser` remains a separate maintenance
API and is not qualified for concurrent use. The unchanged PUT reconciliation can still observe absence before a
queued PUT lands. The role-without-link outcome was reproduced on the corrected .194 route with its real deadline;
a PUT applied by Discord but answered 502 also produced it (L5/X7). These are retained .194 evidence, not new .195
execution results, and this integration does not claim to solve them. Phase 1b must qualify pending-state
erasure, account copy, guard retention/recovery, prune and raw-maintenance composition, with approved privacy texts,
before activation. No automatic guard repair, role replay or production SQL repair is authorized. Link remains OFF.

### The .195 pending bound and persistent admission are different controls

The corrected .194 admitted deletion only with no pending marker of any age. The .195 integration bounds only that
pending predicate, consistently at admission, classification and cleanup. A pending code stops blocking deletion
one second after its expiry plus seven days of delivery grace plus one hour (at most about eight days after issue).
Its marker remains pending for proof, authority and settled-list purposes even after that bound, and prune still
retains every pending marker. A stale marker alone can be removed by a newly admitted player deletion; it cannot
clear an existing deletion guard.

The one-hour allowance preserves the old .195 request-lifetime assumption; it is not a measured provider guarantee
or proof that every queued PUT ended. Ordinary request deadlines support that conservative operational assumption,
but a request outliving it can still have a late role effect. By contrast, a persistent deletion guard represents a
DELETE whose external effect may be unknown: a GET showing absence cannot prove a queued DELETE ended, and a late
DELETE could strip a new proof's role. No established end or owner-approved age bound exists for that operation.
The integration therefore retains indefinite admission instead of silently applying the pending-code allowance to
it. This explains the asymmetry without closing L1 or authorizing TTL takeover, reclaim or recovery. Availability,
privacy, account-copy and erasure treatment remain activation blockers for both releases.

The second DELETE is deliberately inside admission: releasing first would allow a new claim whose role that DELETE
could then strip. A cleanup acknowledgement is required before it runs; unknown cleanup and uncertain second DELETE
are conservative held outcomes, not an instruction to press again. The report's character and key reads are inside
the ten-result cleanup transaction: initial pending/ownership result, character and key reads, then seven guarded
mutations. Exact ownership is checked eight times including the initial result, and every mutation uses the same
bounded pending predicate; the report reads need no ownership arguments. Codes are deleted last. The raw
operator path stays separate and is not qualified for concurrent use. No database/provider transaction spans these
steps, and code issuance or later audits can still add rows outside the cleanup snapshot.

Recording a replacement uses an atomic UPDATE matching the examined member's code and linked time; it cannot
overwrite a newer snapshot or reinsert a deleted owned row. Both that UPDATE and a new-character INSERT require the
account's exact pending code claim in the same statement. Undo releases its claim only when the actual resulting
member matches the captured destination, or, for a new character, when no member row holds the code and the account
holds no row for the character (.195; before, any row for the character kept it). A link whose record batch committed
without writing its member row (a lost race, or an owned snapshot that moved before its CAS) releases its claim when
no member row holds the code (.195 review round 1): it wrote no row, and a code is released only once nothing can
roll back to it, so no row can restore one for it later. If another pending replacement owns the row, undo after a
failed promotion keeps its own claim pending, so that replacement cannot later restore an unused predecessor. These
checks use existing columns and do not add a schema, timestamp, role resend or background action.

A new character that someone else records between the check and this link's record (a lost race) is a definite result
since .195: the INSERT carries `ON CONFLICT(character) DO NOTHING`, so the batch commits its proofs and council keys
without a member row; an owned character whose row changed in that window misses its CAS the same way. Since .195's
review round 1 every such link releases its code once no member row holds it (undo takes back its proofs and the
council keys it recorded first) and answers by the character's holder, as upstream does: linked-elsewhere when
another account holds it (two accounts at once, S11, or the account's own character deleted and taken in that
window), otherwise upstream's "The link could not be recorded: send it again in a minute." (reason `server`: the
account's own other code won, S10, or its own snapshot moved), and sending the same link again then links it (through
the account's own row when it holds the character). The released code can make a new link until its expiry, and
`/verify` hands the same one out again only for the same username while it has more than 12 hours left
(`LINK.REUSE_LEFT`); after that, or for a
link delivered after the code expired, `/verify` issues a new code, which counts toward the three a day
(`CODES_PER_DAY`, subject to the two windows described above). A record batch whose result is unknown (an exception
before or after commit) still holds its code pending (unchanged policy), so three such failures in one counter
window can consume its three charges (the old .195 N3 residual: each answers `server`, another fresh code is refused
with `limit`). A marker remains pending after the age bound until actual cleanup removes it; deletion still requires
no existing admission guard and a newly acknowledged complete player flow. Passing the bound alone is not recovery.

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
`codes`, `members`, `keys` (their ids move to `revoked_keys`), `council_keys`, `used` and `inbox_uploads`.
A pending or held admission refusal runs no DELETE and completes no cleanup; an unknown cleanup may already have
committed without a second removal or final release. Ordinary `limits` counters keep their existing window:
deletion never resets the first-code-anchored counter, but deleting stored code rows can admit additional codes
across that counter boundary, as described above. An uncertain deletion's coordination guard can remain indefinitely.

Concurrent issuance and later `logProof` writes can add rows after the cleanup snapshot. Every proof sent through
the page is logged after its answer, refused ones included: an in-flight proof may log after deletion and an old link
sent later can log `unknown-code`, including its code and character. An account's own later audit row can be removed
only by another deletion that actually obtains admission and completes; a held guard prevents that promise. A paste
by another account is logged under that account's id and can survive the original account's deletion. Its cleanup
requires that other account's deletion, the separately qualified Phase 1b 90-day prune, or separately authorized
keeper work. Once prune removes a settled code, an older audit row tied to the account only through that code may no
longer be found by its deletion. Upstream's watcher inbox is not served; serving it later would add further audit
composition requirements. These historical .195 residuals remain.

The upstream forgotten message's "Nothing is kept ... but ... today" is not a complete retention description.
It omits those possible Link audit rows, concurrent codes, held coordination guards, and **bot-database**
`link.promote_refused`, `link.role_failed` (PUT or DELETE) and `link.role_unconfirmed` rows naming the account.
Player Link deletion does not delete those main-database audit rows. Native erasure is a different operation with its
own audit cleanup; Phase 1b must qualify and disclose both stores. No blanket zero-data or completed-erasure promise
is made here. `revoked_keys` rows contain key ids rather than the Discord id.

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
  activation waits for it (section 8, step 1). Future erasure and ban hooks must qualify deletion admission, bounded
  pending checks, acknowledged cleanup and a second removal before final exact-owner release; the old raw forget
  is not a concurrent substitute, and unknown cleanup must not trigger an automatic replay or second removal.
  The corrected .194's coordination guards also need account-copy,
  privacy-retention and safe recovery qualification. No automatic removal of a held guard is implemented or approved.
- **Other retained review findings.** The original F1–F11 and partial-F2/old-documentation history, old .195 13 nits
  and N3 unknown-failure code consumption remain attributed to their original sources. Claude's L1–L7 and N1–N9
  conditions are carried in the current checklist. The quota-loser `limit` response can still occur while a reusable
  code exists (N5). Adapter gate-accessor rejection and remaining mutation gaps are retained N9 evidence, not a
  blanket never-throws guarantee. Current affected tests and source review must state what changed rather than
  retroactively clearing an old finding.
- **New activation blocker: held deletion admission.** An isolate failure, uncertain acquisition/cleanup/release, or
  DELETE transport/5xx/unlisted-status/bare-false outcome can leave the account unable to link or delete indefinitely.
  Trusted definite nonapplication of the first DELETE releases admission when that release is acknowledged; it does
  not automatically retry the role request. Player retry does not clear a held guard; the privacy disclosure and owner recovery
  procedure remain unqualified. The keeper's read-only diagnostic below is not recovery authority.

- Eligibility refusals reach the player as upstream's "Discord did not take the role change: try again in a minute"
  (ruling, section 2) when the link's undo is confirmed; when it is not, the code stays pending and the answer is
  `server`. Staff see the real reason in the audit rows.
- **What the page shows.** Daniel's page shows its own words for each reason and never the answer's `message`
  (read from the page source at d03ea8a9 during the .194 review; the page is not vendored here). No new reason value is
  added. A live pending marker refuses admission before the first removal; a held deletion guard also refuses before
  role work, even after its pending-code age bound. Those are distinct server-message causes in core, but the page's
  generic `server` text can still give the wrong explanation or retry advice. Refused admission keeps account data
  and live keys; it does not itself revoke the role or the keys. After admitted cleanup, an uncertain acknowledgement
  may mean the data was deleted even though the page says nothing was deleted; no second removal runs and admission
  remains held when its row still exists. An uncertain second removal likewise keeps admission and requires keeper
  review, not a promise that the next press can remove the role. Trusted second-removal nonapplication with confirmed
  final release can answer `discord` with data-already-deleted wording and permit only a later explicit request.
  A lost final-release acknowledgement may follow a committed release, so the response cannot assert that the guard
  necessarily remains. These L1/L2/L3 privacy, cause, retry-advice and erasure-confirmation limitations remain activation
  blockers; core's keeper advice is not shown by the external page.
- `POST /proof` lives on workers.dev, outside the roachcouncil.com zone's WAF; the in-memory filter and upstream's D1
  limits (before Discord is asked) are the flood protection.
- An error raised outside `handleProof` (the Worker's top-level catch, a held write admission, the recovery floor)
  answers without CORS; the page then shows a generic failure.
- A PUT transport failure gets one confirming GET, without a resend. If that GET precedes a queued PUT, the later role
  effect is still possible; L5's .194 route evidence reproduced role-without-link, including the applied-502 case.
  It remains an unresolved inherited behavior; this documentation edit runs no .195 reproduction.
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

The historical .194 and .195 results are retained with their exact source tuples in `deploy-checklist.md` and the
private release receipts. This section states the corrected-parent qualification requirements, not new pass counts.
The old 14e02bc/ac45 .195 manifest and its diagnostic 28 PASS / 4 FAIL, 14 notes do not qualify changed bytes. Claude's
separate exact-235 synthesis recorded a diagnostic 26 PASS / 6 FAIL and 14 notes; exit 0 means diagnostic completion,
not that every assertion passed. Both histories remain separate.

Qualification must preserve the union of corrected .194's 265 checks and the historical .195 suite, with honest
explicit revisions where admission changes their expected outcome. Cover vendor pins and count-guarded inverse
reconstruction, generated-byte parity, all P1-P6 behavior, OFF route/response/main-database identity (497 checks),
CORS/gate/body/budget controls and original individual deadlines. New affected controls must cover:

- the same bounded pending cutoff at admission, classification and every cleanup mutation, at live−1, live and live+1;
- the seven cleanup mutations' ownership checks, initial pending/ownership result, in-batch report shape, before/after
  table snapshots, one-shot read/batch/release faults and delayed-statement controls;
- second-removal ordering while the exact guard is held, the full confirmed/not-applied/unknown/throw matrix, release
  as the last operation, no second removal after unknown cleanup, and no false retry promise under a retained guard;
- both claim/admission orderings, already revalidation, one-snapshot refused-claim classification, lost races and undo
  interleavings, settled-only lists and the unbounded authority predicates;
- the P6 concurrent quota controls unchanged, including independent row/counter limits, counter boundaries, reuse,
  unknown acknowledgements and collision rollback; quota/refill documentation must match the five-in-a-rolling-window case;
- pending prune retention, all old .195 stuck-marker/audit/key fixtures and unknown-failure code consumption, with
  no historical assertion or deadline silently removed or weakened.

Run the required ownership and quota mutants, harness2/verify, battery, local workerd D1 controls and full source
qualification leaves on the actual resulting source, then require genuine current-head Claude/Codex signatures,
completed exact-head zero-findings hosted review, all threads resolved, no change request and latest hosted CI.
No result is asserted by this list. The unwired `checkProof` helper must not be connected directly to an already/status
answer: only the player `acceptProof` path revalidates settled state and admission. P6's production D1 `changes()`
and per-statement `meta.changes` assumption is locally supported but remains L6's reasoned activation limitation;
no staged provider smoke or protocol change is authorized by this text.

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
   The full Phase 1b R3/R4/R5/R7/R14/R15 and owner Phase 2 gates remain. Claude's C3 additionally requires qualified
   L1 recovery/privacy/account-copy/erasure treatment, L2 fixes, approved L3 texts, L5 reconciliation, L6 resolution
   (a reviewed protocol change or separately authorized staged smoke) and all L7 ownership tests before recovery.
   This document does not authorize any recovery, TTL/reclaim, staged provider action or activation.

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

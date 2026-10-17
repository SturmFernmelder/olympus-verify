# Councillor browser verification and the named beta test

The .155 source integrates the browser/backend B1 bridge with AddOn 0.6.10. Its roster, guild-frame
placement and ordinary panel behavior retain the accepted 0.6.9 implementation. Missing feature
values fail closed. Signing and the named exception remain OFF until the exact combined release is
qualified and configured. The exception is independent of erasure activation; erasure readiness is
not established by a successful QR test.
No native rank, appointment or game permission is changed by source publication. Command registration,
browser enrollment, intended role effects and qualified real game/browser acceptance are separate actions.
The reader is `/static/qr-phase1.html`; its authenticated navigation stays hidden while Phase 1 is OFF.

A member needs no AddOn. The signed-in member creates a ten-minute code (or uses the genuinely
Discord-signed, accountless `/olympus-qr` interaction) and whispers `!olympus <code>` in game.
An eligible councillor keeps their AddOn and browser running. Enrollment requires a current verified
GUID, a complete trusted fresh native roster showing **High Council, zero-based index 1**, the
original active privacy generation, account incarnation and current Discord membership. Generic Officer
or site administration never substitutes. The current five-rank beta roster has no High Council.
The owner's separately authorized B1 exception permits only Fern Melder's exact Officer character in
one attended window for Stavros Heuto; it does not create or claim a High Council promotion.

The private Ed25519 key is a nonextractable browser CryptoKey in IndexedDB. The AddOn contains no
private key. The signed message is a **councillor attestation**, not a Blizzard origin certificate.
Compromised councillors or same-origin JavaScript can still fabricate/sign observations. A stolen
public-key table cannot forge a signature, but database/website compromise is not a complete trust
boundary. The original key lease expires after 24 hours without renewal; revocation, generation
change, ban/rename hold or a contradictory newer roster closes it.

The attended path signs one observation. The explicit automatic opt-in creates a five-minute,
at-most-ten-code lease bound to the original key/GUID/session/challenge. Only matching captures
from the selected game window are automatically signed; each code is consumed once in the same
native database batch as the link/proof and lease counter. Stop cancels the server challenge and
stops local capture/signing. Page close stops local signing; server expiry still applies. An already
accepted operation can finish. Unknown provider results stop automatic continuation; deliberate
reconciliation reads current server state and never repeats the spent write. Rate limits may hold
a busy lease before ten observations. No offline councillor, autonomous Blizzard certificate or
three-of-five consensus is claimed.

Game observations bind requester/signer GUIDs, complete names, OLYMPUS, **Classic Beta PvP 2**,
build 70205/interface 16001, exact native rank names/indices and a fresh timestamp. The AddOn
waits for a native roster update, considers it fresh for sixty seconds, queues at most ten whispers
in RAM, and displays each for five seconds. There is no game-to-browser acknowledgement channel:
a missed display requires the member to check status and whisper the still-valid code again.
The real version-8/L QR has **49×49 modules** and a 192-byte payload cap. Complete UTF-8
observations over that cap are shown as a bounded manual-copy fallback, never truncated; the
512-byte complete-wire cap still applies. Long-name fallback uses the attended signing path.

## Automatic rank effects

Rank labels use a configured closed five- or ten-role map with exact profile/name/index matching.
The beta five-rank ladder is Guild Master 0, Officer 1, Veteran 2, Member 3, Initiate 4. The proposed
ten-rank ladder is Guild Master 0, High Council 1, Officer 2, Officer Alt 3, Raid Leader 4, Veteran 5,
Raider 6, Member 7, Alt 8, Initiate 9. Cosmetic target roles must have zero Discord permissions.

The separate privileged gate derives targets exclusively from configured source bindings:

| Native profile | Native rank | Discord target |
| --- | --- | --- |
| beta-five / ten-rank | Guild Master 0 | `ROLE_GUILD_LEADER` |
| beta-five | Officer 1 | `ROLE_OFFICER` |
| ten-rank | Officer 2 | `ROLE_OFFICER` |
| ten-rank | Raid Leader 4 | `ROLE_RAID_LEADER` |

High Council and Officer Alt confer no council appointment or privileged staff role. Existing
manually assigned staff roles are preserved. Prior staff roles actually granted by this writer are
removed before a replacement; a held/unknown removal stops the sequence. Bot identity must match
the configured application; current Manage Roles, managed-role, target-member and hierarchy checks
precede every effect. Targets above the bot hold. A requester/caller cannot choose a role ID.

Successful proofs trigger member/rank settlement immediately, then the browser continues at most
two intents per request. A request reserves eight actual Discord calls per intent, sixteen per pair,
including compensation; provider writes use one attempt and no 429 retry. Original generations and
current proof/roster fences are consumed in the dispatch CAS and checked after awaits. A landed
grant losing authority gets a separate durable one-use removal. Accountless bans/rename/blocking
removals use audited source predicates and original pre-provider generation/absence. Guild departure
also requires current trusted complete roster absence of every own native GUID. Account erasure consumes the genuine durable retiring job,
and local deletion must consume the fresh SQL-confirmable absence receipt in its own batch.

The composed roster-wide unattended continuation supplies its original generation, current exact
native profile and measured central-writer budget. The existing sweep is bounded to one account per
run in the shared .135 accounting model. It works independently of the Phase 1 signer gate. No caller
may substitute a later generation or use a stale/incomplete roster. An explicit rank-sync page can
settle selected native intents only while the bridge's route admission is enabled.

A lost proof response does not require proof replay. The own-only receipt reader recovers the
original generation's accepted requests and durable operation IDs after reload. Reconcile performs
GET-only outcome checks. Deliberate continuation can create missing admitted intents or finish
pending ones under the original proof fences; it cannot repeat a spent provider write. The privacy
erasure gate also forces the original-generation central membership writer while QR remains OFF.
The current erasure job can reconcile at most two expired/spent role debts through GET only;
the tested two-debt path uses fourteen D1 statements and eight Discord reads. Present or ambiguous
effects remain held for current authorized removal or human-managed staff resolution. No unknown
provider record is aged out merely because the five-minute proof expired.

## Composition and attended acceptance

The six source families, including the B1 window, are registered with the serving privacy catalogue and
real own-only export/atomic-erasure hooks. Unknown provider custody holds erasure until fresh
reconciliation; no sole no-repeat receipt is discarded. The B1 table, provenance columns and immutable
triggers are required alongside the normal QR tables; the complete source profile must match. Root composes
the actual `privacy-serving-authority` and `privacy-business-catalog` modules, original cookie/generation
admission at existing grant callers, shared schema/route/front-end/test integration and retention budgets.
No dormant `account_generations`/`purpose_generations` SQL authority is used. Private generation
utilities supply only random IDs/hashes. The accepted 12-month inactive/365-day export retention plan
is not replaced by a new QR-specific scheduled retention policy here.

Local tests execute actual TypeScript with SQLite, real Ed25519 and the serving-authority ABI;
Discord is faked. The real browser module is executed against DOM/media/storage shims and real keys.
Lua 5.1 renders an actual 49-module matrix that the existing jsQR decodes byte-for-byte. These checks
do not establish native game behavior, actual browser capture availability or live role permissions.
Before activation: review the combined source/schema/budgets, preserve a verified database export,
confirm current bot identity/hierarchy/configured maps, install the reviewed AddOn/command through
the owner-controlled release, and perform the concrete member/councillor game/browser flow. Keep
the Phase 1 signer gate OFF until qualified native High Council eligibility or the exact approved
named B1 test prerequisites are established; independent
native rank mapping retains its own exact-profile gates. Battle.net and the attended beta reset
retain their existing gates. No appointments or native bank permissions are issued here.

## The named B1 acceptance sequence

The exact participant is Discord `472099715253796864`, native GUID `Player-4613-005A70D8`,
Fern Melder, OLYMPUS Officer at zero-based index 1 of the five-rank beta profile. The source requires
realm `Classic Beta PvP 2`, guild realm `ClassicBetaPvP`, game version 1.60.1, build 70338 and
interface 16001. The requester is Discord `102204162531430400`, native name Stavros Heuto, with
his distinct GUID read from the current complete trusted roster. Stavros needs no AddOn.

Before the attended test, qualify the combined schema/profile, original signed-session incarnation,
QR enrollment, native membership-only role consumer and browser/AddOn package. Review the target
Guild Member role, bot identity and hierarchy, the exact staff-window POST path in the request
firewall, and the release's approved review digest. Install the matching AddOn without replacing
private configuration or queues. Keep the ten-rank normal High Council profile separate.

1. Configure signing and the exact named exception only on the accepted release. The exception needs
   `QR_BETA_FERN_EXCEPTION_ENABLED=true`, one fresh `QR_BETA_FERN_WINDOW_ID`, and
   `QR_BETA_FERN_REVIEW_DIGEST`; missing or malformed values hold. These are operator release steps,
   not effects of opening a web page. No actual value is supplied by this document.
2. Both participants sign in normally. Refresh the actual complete trusted roster immediately before
   the test; the server requires it to be less than ten minutes old, coherent and at or after the
   configured links cutoff. Fern's verified main link must identify the exact Officer GUID. Both
   original accounts and current Discord memberships must remain eligible.
3. Stavros uses the scanner page to create his own fresh ten-minute request code. Fern opens
   `/admin/qr/beta-window`, reviews that code and the exact release plan, and types
   `OPEN NAMED BETA TEST`. The one-use action opens a fixed four-minute window, bounded by that
   original code and both sessions. Checking an uncertain result never opens a second window.
4. Fern enrolls a nonextractable Ed25519 key in his own browser at `/static/qr-phase1.html`, then
   creates a B1 challenge. Use the generated commands verbatim: `/olv browser beta enable`, then
   `/olv browser beta <original OLG2C envelope>`. The seven-field envelope preserves the original
   absolute deadlines; copying it again cannot renew them. The AddOn keeps no signing key.
5. Stavros whispers his complete `!olympus <code>` command to Fern. Following a fresh native roster
   update, Fern's AddOn shows the OLG2/B1 observation. Scan it in that enrolled browser or copy the
   complete bounded wire, review the distinct named actors, sign and submit. The B1 automatic
   opt-in admits only this one original request, rather than the normal ten-code lease.
6. Read the original proof and durable settlement outcome. B1 can settle only the original configured
   membership role, even when both rank-mapping switches are enabled. An already-present role is
   confirmation of the desired state, not evidence of a fresh grant. A timeout or unknown result
   requires read-only reconciliation; do not repeat a spent write. Revoke the exact browser key and
   close local beta mode deliberately when the test is finished.

Backend Native tests use real local SQLite and cryptography with synthetic provider responses.
The browser tests use the actual module and real Ed25519 with a DOM/storage boundary shim; Lua
tests and the real QR decoder cover both wire formats. None of these are a live game observation,
browser capture, role write, or attended acceptance receipt. Those final checks remain explicit.
The browser-only attempt-data page `/static/qr-beta-window-data.html` offers local export and
personal-detail redaction without an API request or guild access, including after account erasure.

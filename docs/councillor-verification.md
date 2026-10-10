# Councillor browser verification candidate

This is the composed .135 Phase 1 source candidate. Missing feature values fail closed. The candidate
keeps `QR_PHASE1_ENABLED` OFF because the observed beta ladder has no native High Council; privacy
controls and the independent beta-five rank-mapping gates are enabled in its reviewed configuration.
No native rank, appointment or game permission is changed by source publication. Command registration,
browser enrollment, intended role effects and qualified real game/browser acceptance are separate actions.
The reader is `/static/qr-phase1.html`; its authenticated navigation stays hidden while Phase 1 is OFF.

A member needs no AddOn. The signed-in member creates a ten-minute code (or uses the genuinely
Discord-signed, accountless `/olympus-qr` interaction) and whispers `!olympus <code>` in game.
An eligible councillor keeps their AddOn and browser running. Enrollment requires a current verified
GUID, a complete trusted fresh native roster showing **High Council, zero-based index 1**, the
original active privacy generation and current Discord membership. Officer and site administration
never substitute. The current five-rank beta roster has no High Council: real enrollment and game
acceptance remain unavailable until an independently authorized eligible actor exists.

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

The five source families are registered with the serving privacy catalogue and real own-only
export/atomic-erasure hooks. Unknown provider custody holds erasure until fresh reconciliation; no
sole no-repeat receipt is discarded. Eight additive cold DDL statements are required. Root composes
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
the Phase 1 signer gate OFF while qualified native High Council eligibility is absent; independent
native rank mapping retains its own exact-profile gates. Battle.net and the attended beta reset
retain their existing gates. No appointments or native bank permissions are issued here.

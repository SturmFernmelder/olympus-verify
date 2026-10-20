# Synthetic shared census lab

This is the local implementation of the reviewed shared-census semantics, using **synthetic fixtures only**. It is a separate development tool, not a deployed feature or a connection to Olympus accounts, D1, Discord, a publisher, a game client or the existing QR pilot. The live Worker, schema, settings, feature flags, Native E2, safeguards and launch gates are untouched.

## Run locally

With the existing Node 24 installation, from the repository root:

```powershell
& 'C:/Program Files/nodejs/node.exe' tools/shared-census-lab/serve.cjs --port 49382
```

Open the printed `http://127.0.0.1:49382/` URL on the same computer. No dependency installation is needed. The server binds to IPv4 loopback only; a phone cannot reach the PC's loopback address. Desktop/mobile viewport checks do not establish physical phone operation. Do not expose it through LAN, a proxy, a tunnel or hosting. Stop the process when finished. All synthetic data disappears when it stops or the lab resets.

The page provides fixed synthetic accounts and registered fictional guilds. Preview a preset, review the claimed source times, explicitly consent to the private synthetic reporter association, prepare an original intent, and deliberately submit it to this local memory store. These are local fixture submissions, not production uploads. There is no arbitrary report/JSON entry, file picker, QR input, camera, screen capture or real guild/account selector.

Try a lost response and check its original outcome, select a second reporter to create a conflict or duplicate, withdraw only your own receipt, switch to the read-only fixture, and advance only the lab clock to inspect online/size expiry. The computer's clock is not changed. No automatic reporting or response retry is provided.

## What is implemented

| Design requirement | Local implementation |
|---|---|
| Closed aggregate schema | Exact version/keys/types; fatal UTF-8 decoding; duplicate and escaped-duplicate keys refused; invalid Unicode, excessive depth/nodes, non-finite values and bodies over 4 KiB refused. |
| Source scope and privacy | Fixed fictional registry, one guild per report, masked counts/complements, no player/role/location/private fields, no federation totals or unique-human claims. |
| Admission and consent | Private synthetic sessions; distinct reporter and reader permissions; consent version and original account/session/incarnation tuple checked in the actual in-memory transaction. Holds and revocations are exercised through synthetic domain fixtures only. |
| Intent and outcome | Five-minute intent, immutable exact-byte retry identity, original outcome recovery, spent/expired/cross-account refusal, no adoption or blind retry. |
| Ownership and deduplication | Content deduplicates separately from each privately owned receipt/consent. Repeated content adds no votes or authenticity and never renews its original deadline. |
| Conflicts | Conflicting active observations withhold all counts. The projection reveals neither competing values nor reporters. Differing fresh/older online availability is conservatively withheld rather than treating unknown as zero or selecting a preferred report. |
| Freshness and expiry | Claimed source and trusted local receipt times remain distinct. Online is available through 900 seconds; size expires at the original hard deadline. Future claims admitted within 60 seconds remain unavailable until both source times arrive. Browser read-time expiry also hides cells; hidden pages clear their view/draft and require explicit refresh. |
| Withdrawal and subject erasure | Withdrawal affects only the owner's contribution; another eligible receipt can survive within the original content deadline. Synthetic subject erasure removes its contributions/outcomes and disables the fixture identity. This is not live Native E2 qualification or an all-copies claim. |
| Abuse/resource bounds | Per-reporter attempts and acceptance cooldown, bounded active intents, fixed input/registry size, and bounded transport sessions/previews/intent handles. No automatic job or cron is added. |

`core.cjs` uses the real built-in SQLite engine with `:memory:` only. No filesystem database or report log is created. Data expiry is checked during reads even when cleanup has not run. The fixture-only domain hooks (`setAccount`, `eraseAccount`, `cleanup`, count-only `inspect`) are not HTTP endpoints and cannot change a real account or application control.

## Deliberate local adapter boundary

The domain accepts the closed design DTO. The HTTP adapter accepts only server-issued synthetic preview and intent handles, then constructs that exact DTO from its own immutable preset. It does **not** expose a generic report upload endpoint. This difference is intentional: accepting arbitrary JSON would defeat the owner's synthetic-data-only scope.

The six proposed census operations are demonstrated on loopback: contract, intent, report, own receipt, withdrawal and private summary. An additional original-intent outcome route makes lost-acknowledgement recovery possible when the receipt ID was never received. Local session, preview, clock and reset routes are fixture controls. None is mounted in the production Worker. Normal provider authentication, real reporter admission, policy/consent publication, D1 migrations and production privacy-registry integration remain unimplemented and separately gated.

Every mutation requires the exact loopback Origin and the current synthetic session's CSRF token. Fixed Host and path checks, HttpOnly/SameSite cookies, no CORS, no redirects/proxying, no-store responses, restrictive CSP and disabled capture permissions fence the local surface. The synthetic account selector is intentionally a test identity issuer, not production authentication. Both source code and interface prominently say so.

## Explicit boundary clarifications

The report's hard expiry is exclusive: `now >= expiresAt` hides it, including the 24-hour endpoint. The 900-second online boundary remains inclusive. Accepting a source clock up to 60 seconds ahead does not publish future counts or prove a clock offset.

A near-future claim can reach its first-receipt hard deadline before its source-age deadline. To prevent the identical content from being reintroduced during that remaining interval, the local store keeps a count-free content digest/original-deadline tombstone through the later source-age deadline (at most 60 extra seconds). Count payloads still disappear at the original hard deadline; no report lifetime is extended. This refines the draft's tombstone wording for the local implementation. It authorizes no production retention change.

Only synthetic records are used for all tests. These tests cannot establish genuine source authenticity, complete guild coverage, real reporter consent, physical camera transfer, provider behavior or live deployment acceptance. The original no-upload QR pilot remains independent and unchanged.

## Focused verification

```powershell
& 'C:/Program Files/nodejs/node.exe' tools/shared-census-lab/tests/core.test.cjs
& 'C:/Program Files/nodejs/node.exe' tools/shared-census-lab/tests/independent.test.cjs
& 'C:/Program Files/nodejs/node.exe' tools/shared-census-lab/tests/ui.test.cjs
```

The receipt records which of these actually ran, against which source bytes, and their real results. Do not call this a full application chain, hosted CI or production qualification. The owner's stopped 92-command aggregate and runner review loop remain stopped.

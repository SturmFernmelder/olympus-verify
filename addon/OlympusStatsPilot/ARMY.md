# Army QR mode — 0.2.0

This optional addon has two separate modes. The existing `/ogstats` command and
`OLCS1` frames remain the one-guild **local preview**, documented in README.md.
The new `/ogarmy` command creates `OLCS2` aggregate frames for the website's
Army reporter page. Neither command uploads anything from the game.

Only an existing administrator admitted by the website can publish through the
Army reporter page. A QR code does not establish membership, authenticate its
source, grant a role, or replace the website's admission checks. All ordinary
production feature flags, Native E2 controls and launch gates remain separate.

## Attended transfer

1. Use the reviewed 0.2.0 addon package. Installing or updating it is a separate
   attended action; this source and its offline tests do not install anything.
2. Open the website's Army reporter page through your normal signed-in session.
   Start a scan and copy its exact `/ogarmy <32-character-lowercase-challenge>`
   command. An `/ogstats` command or `OLCS1` code belongs to the local preview
   and cannot enter the Army publishing flow.
3. Enter that command in WoW on an ordinary guild character outside combat.
   Choose **Request snapshot**. If needed, enable **Show Offline** yourself in
   the native guild roster and request again. The addon never changes that
   filter. No complete requested roster within 15 seconds means no snapshot.
4. Choose **Display QR**. In the browser, explicitly select only the WoW window
   for capture, or use the page's ordinary camera/image/paste option. Keep
   unrelated chat and private screens out of the selected source. The addon
   cannot start capture or select a browser source for you.
5. Complete the browser's handoff before its original 30-second scan deadline.
   Review the decoded aggregate in the browser. Publication is a separate
   deliberate browser consent/submission step; displaying a QR is not consent
   and does not submit. If the scan expires or scope/clock checks refuse it,
   stop and obtain a fresh command; do not edit a frame or change a deadline.
6. Use **Stop and clear** when finished. Closing the panel, combat, guild/world
   changes, logout or a refused clock also stops the addon session and clears
   its copied/displayed frames. Follow the browser's own stop/cleanup controls
   for any capture and pending browser operation.

The addon session expires after five minutes and each prepared snapshot after
its original 60 seconds. V2 requires readable server and monotonic clocks;
neither clock can extend the other's deadline. An unchanged roster event can
revalidate the original snapshot, but cannot renew its timestamp, frames,
challenge or expiry. Changed native aggregate values clear the snapshot.

## Aggregate scope and masking

The addon reads only a requested complete native **own-guild** roster. Names,
GUIDs, notes, localized class/rank labels and zones are transient completeness
inputs and never enter the QR. The QR contains guild name, native realm group,
faction, original observation time, masked total/online count, and three optional
fixed-position count arrays:

| Field | Positions, in order |
| --- | --- |
| `classes` | Warrior, Paladin, Hunter, Rogue, Priest, Shaman, Mage, Warlock, Druid |
| `levels` | 1–9, 10–19, 20–29, 30–39, 40–49, 50–59, 60 |
| `ranks` | Native numeric rank indices 0 through 9; no rank names |

Every exported distribution contains only zero or counts of at least five,
and sums exactly to the numeric reported total. If any bucket is small (1–4),
unknown, unsupported or missing, or the total is small, the **whole** affected
distribution is `null`. It is never partially released, renormalized or guessed.
Total and online masking also retain the local pilot's small-complement fence.

Counts describe reported characters, not unique people or proven federation
coverage. The payload explicitly declares `sourceVerified:false` and
`membershipProof:false`; a checksum protects transfer consistency, not honesty
or source authentication. The website independently validates scope, freshness,
masking, admission and publication intent. A website login alone cannot read a
WoW roster or keep it live after the attended transfer ends.

## Separate wire contract

V2 canonical UTF-8 JSON uses `format:"olympus-stat-observation-v2"` and
`addonVersion:"0.2.0"`. Its guild row appends `classes`, `levels`, then `ranks`
after the original `online` field. Frames are:

```text
OLCS2|<nonce32>|<SHA256-base64url43>|<part003>|<total003>|<chunk-base64url>
```

The original fixed limits remain 1023 payload bytes, 75 raw bytes per chunk,
14 parts, 191 characters per frame and the owned 49×49 QR encoder. Nothing is
truncated. The browser accepts v2 only in this flow, requires both wall and
monotonic scan clocks, rejects future/older-than-24-hour source observations,
and requires online counts older than 15 minutes to be withheld. V2 is separate
from `OLCS1` local preview and the identity/verification `OLG1`/`OLG2` protocols.

There are no SavedVariables, companion executables, addon network requests,
addon messages, account identifiers or automatic uploads. Any shared aggregate
storage occurs only through the admitted website's separately confirmed
publication operation.

## Test boundary

`addon/tests/test_army_stats.lua` uses fictional native APIs in a fresh LuaJIT
runtime. `tools/army-qr-live/tests/lua-roundtrip.test.cjs` exercises the actual
Lua serializer and QR encoder, shipping image-decoder worker and browser
protocol using fictional memory-only pixels. These checks do not claim a new
installed-game trial, mobile camera acceptance, genuine source identity or a
production publication. Existing v1 source and tests remain separate.

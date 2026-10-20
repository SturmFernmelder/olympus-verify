# Olympus Stats Pilot 0.1.0

A separately named, optional addon for a **one-guild local browser preview**. It
does not install or change Olympus Guild, Olympus Verify or any other addon.
Installation and actual game/capture acceptance are separate attended steps;
offline tests alone do not establish either result.

## Data and limits

- Collects one requested native own-guild roster after `GUILD_ROSTER_UPDATE`.
- Requires the native **Show Offline** filter already enabled. It never changes
  that filter and holds if the client cannot expose it.
- Refuses unreadable, duplicate, changing or incomplete rows and requires the
  reporter's own online row by exact native player/roster GUID. It never guesses
  a name or realm from the beta client's two-part `UnitName` returns. Native
  labels exist only transiently while checking completeness; no character names,
  ranks, notes, GUIDs or zones enter output. The own native GUID is retained only
  in active request/snapshot memory for scope checks and is cleared with frames.
- Emits only guild name, native realm group, faction, client observation time,
  reported character count and online count. Counts 1–4 become `few`; when the
  total is `few`, online is `null` to avoid disclosing that small total indirectly.
  A numeric online count is also withheld as `null` if subtraction from the total
  would reveal 1–4 offline characters. The browser independently checks this fence.
- Character counts are not unique people. A roster-update event is not proof of
  server freshness or full federation coverage. A checksum is not authentication.
- No SavedVariables, network requests, addon messages, uploads, shared storage,
  account identity, Discord association, role writes or verification bridge.

The canonical payload declares `sourceVerified:false` and
`membershipProof:false`. Neither those flags nor a browser challenge establishes
trust in reported data. The source can be edited by its operator.

## Attended local use

1. Review and package this separate addon candidate before any owner-approved
   installation. Do not replace an installed addon or verification configuration.
2. Open the local browser pilot. Start a new local session and copy its exact
   `/ogstats <32-character-lowercase-challenge>` command.
3. In the game, with the desired character in its own guild and outside combat,
   paste that command. Sessions are OFF after reload and expire after 5 minutes.
4. Choose **Request snapshot**. If told to enable native Show Offline, do that
   manually in the guild roster and request again. No event within 15 seconds
   means no snapshot. A complete returned roster prepares counts but does not
   automatically display a QR.
5. Choose **Display QR** for cycling parts, or **Copy complete frames** and copy
   the selected text into the local preview. Copy fallback uses the game's normal
   EditBox selection; there is no automatic clipboard API or file export.
6. In a desktop browser, explicitly select the WoW window for browser capture.
   The local browser may also accept frames from a phone camera or pasted text.
   Avoid showing unrelated chat or private screens. No capture is started by this
   addon and no sender can select the browser's source for you.
7. A snapshot expires after its original 60 seconds. A later roster update repeats
   every native completeness, self, scope, filter, stability, combat and clock
   check. Only identical **unmasked** total/online counts retain the exact original
   QR frames and cutoff; any change or error clears them. This replaces the first
   pilot's unconditional later-event clearing, which also cleared harmless native
   event bursts triggered by other addons. Revalidation makes no new request,
   serialization, timestamp, digest, session, export or automatic display.
   Combat, guild/world changes, logout, clock rollback, closing the panel or
   **Stop and clear** turns the session OFF and clears displayed/copy text.

Browser session expiry is independent and can be shorter. A browser that has
expired its challenge will refuse frames even while this local addon session is
still armed. Obtain a new browser command rather than changing either deadline.

Clock refusals name which original guard fired: an unreadable server clock,
movement before the session start, backwards movement after a prior read, or the
original five-minute session expiry. These are fixed diagnostic labels, not raw
clock values, tolerance, automatic retry or permission to continue. The earlier
real trial's combined expired/clock message cannot establish which condition
occurred. Changed native counts still clear the snapshot; unchanged events do
not renew it. A local synthetic test of those refusals is not a successful
real-game transfer.

## Wire format

The exact canonical UTF-8 JSON payload is limited to 1023 bytes. Each part is:

```text
OLCS1|<nonce32>|<SHA256-base64url43>|<part003>|<total003>|<chunk-base64url>
```

The SHA-256 covers the complete canonical payload. Parts use 1-based three-digit
indices, contain at most 75 raw bytes (100 unpadded base64url characters), and have
a 91-byte header. There are at most 14 parts and 191 bytes per frame. No payload
is truncated. `OLCS1` is separate from the verification QR protocols.

`Libs/StatsPilotQr.lua` is a namespace-separated copy of this repository's owned
pure Lua fixed QR encoder. The original file and its global remain untouched.
Hashing, base64url, aggregate collection and this pilot UI are independently
authored here; no third-party companion/addon code was copied.

## Verification boundaries

`addon/tests/test_stats_pilot.lua` uses a fresh Lua 5.1/LuaJIT runtime and synthetic
native APIs, known hash/encoding vectors and the real pilot QR encoder. It does
not prove installed-game compatibility, camera/capture performance, remote data
freshness, genuine membership or production acceptance. All application flags,
Native E2 controls, deadlines and launch gates remain outside this pilot.

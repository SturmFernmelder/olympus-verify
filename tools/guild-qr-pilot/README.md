# Olympus local guild QR pilot

An attended, one-guild observation from a WoW addon to a browser. This tool has no upload, publishing, account-linking or shared-storage endpoint. It is separate from Olympus identity verification and is not deployed on the production website.

## Run locally

From this checkout, run:

```powershell
& 'C:/Program Files/nodejs/node.exe' tools/guild-qr-pilot/serve.cjs
```

Open the printed `http://127.0.0.1:<port>/` address. Stop the server with Ctrl+C. The server binds only to loopback and serves a fixed list of static files; it accepts no report submissions. Do not expose it through a tunnel or change its bind address.

Install the separate `addon/OlympusStatsPilot` folder in the client's `Interface/AddOns` folder, then use the normal game reload. See its README for client compatibility and refusal conditions. It has no SavedVariables and starts stopped.

1. Choose **Paste frames**, **QR images**, **WoW window** or **Phone camera**.
2. Click **Start local scan** and run the displayed `/ogstats <challenge>` command in the game. Each browser scan has a fixed 30-second limit, including any capture picker.
3. Click **Request snapshot** in the addon. Its native guild roster must include offline members. The pilot never changes that filter. It waits for the requested native update and refuses incomplete or changing data.
4. Click **Display QR** or **Copy complete frames**. Read all matching frames through the chosen browser input. Copying is deliberate; nothing automatically reads the clipboard.
5. Review the aggregate locally. **Stop & clear**, changing input, hiding the page, reloading, an error or expiry clears it. The addon also has **Stop and clear**.

QR screenshots are opened and decoded inside the page, not uploaded. A selected window exposes its visible pixels to this local page while capture is active. Pick only WoW; monitor/tab captures are refused. The browser cannot attest that a window is actually WoW. Camera and screen capture require the user's normal browser consent.

### Phone boundary

The layout supports narrow screens. A phone's `127.0.0.1` is the phone itself, not this PC. This loopback-only server intentionally cannot be reached over LAN. A physical phone camera session therefore needs a separately arranged local secure context on that device; this package does not enable LAN access, TLS bypasses, uploads or hosting. Responsive viewport tests do not prove physical-camera compatibility.

## Data and trust

Only one guild name, realm, faction, observation/receipt times, character total and online aggregate can pass the closed schema. Names are checked transiently inside the addon for completeness and duplicate checks; an exact native GUID selects its own online row and stays only in active session memory. None of these identity values enter the output. No player names, ranks, notes, GUIDs or account fields are exported.

Counts 1–4 are masked. Online counts are withheld when a small total or small remainder would disclose them. Source times stay unchanged on read. Old online values become unavailable; an observation older than one day is refused. A complete preview lasts at most 15 minutes in memory. Addon sessions last five minutes, requested updates 15 seconds and snapshots 60 seconds. Repeated native roster events fully revalidate the original unmasked counts and every completeness guard; identical observations retain their original frames and deadline, while any change or read failure clears them. Events never renew freshness or trigger an automatic request.

The distinct `OLCS1` format carries a fresh browser challenge and SHA-256 checksum. It detects transfer errors and mixed frames, not fabricated reports. `sourceVerified`, `membershipProof`, `accountLinked` and `persisted` remain false. Character counts are not unique people, all-guild coverage, proof of membership or a live publisher feed. Nothing affects verification, roles, appointments, Native E2 or launch entitlements.

## Focused tests

```powershell
& 'C:/Program Files/nodejs/node.exe' tools/guild-qr-pilot/tests/protocol.test.cjs
& 'C:/Program Files/nodejs/node.exe' tools/guild-qr-pilot/tests/server.test.cjs
```

The new addon leaf is `addon/tests/test_stats_pilot.lua`; run it from `addon/tests` with an existing Lua 5.1 runtime. The independent cross-language test accepts the directory created by the evidence fixture script; see `tests/lua-roundtrip.cjs`. These are local pilot checks, not the application aggregate or hosted CI.

The vendored jsQR source is unchanged and retains its license and notice. No third-party game addon archive is executed.

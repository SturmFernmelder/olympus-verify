# Real addon → local census, attended test

This is a separate local test process for an actual `OlympusStatsPilot` observation. It does not change the synthetic census preview, the installed addon or the production website. No production bindings, real account admission, uploads, persistence, feature flags, Native E2 controls or launch gates are connected.

Run from this checkout with the existing Node 24:

```powershell
& 'C:/Program Files/nodejs/node.exe' tools/attended-census-local/serve.cjs --port 49385
```

Open the printed `http://127.0.0.1:49385/`. The HTTP listener accepts only this computer’s IPv4 loopback. Never expose it through LAN, tunnels, proxies or hosting.

Choose an original pilot input, start a scan, run the displayed `/ogstats <challenge>` in the game and deliberately request a snapshot. All original native roster completeness, exact self GUID, Show Offline, combat, source-time and expiry checks remain. The tool never changes those settings. Requesting a snapshot does not display or submit it automatically. Choose **Display QR** in the addon; use the browser’s normal window picker to select only the WoW window, or use the original complete-frame fallback. Keep the browser visible. Browser window selection does not authenticate the source.

The unchanged decoder and multipart protocol must complete within the original **30-second scan**, including the picker, game interaction and deliberate handoff. Review the complete aggregate, then choose **Use decoded observation locally** before that original deadline. This transfers only the canonical original frame strings to the loopback process. The server independently reassembles them, retains the actual single guild and original source times, and creates a bounded preview. No arbitrary decoded JSON or counts are accepted.

The later steps remain separate: explicit consent to **fictional Reporter A** ownership, prepare an original intent, then deliberately submit to the local process’s SQLite `:memory:` census. This is not a real account association. No account identity, membership, game origin, source authenticity, unique-human count or all-guild coverage is proved. The checksum detects transfer errors and mixed frames only. Small totals/remainders stay masked; old online counts disappear. The existing source, intent, preview, rate, ownership, conflict and withdrawal limits remain. An unknown outcome is recoverable only through the original intent; there is no blind resubmission.

Stop/source changes, hidden/page exit and clock expiry stop owned capture/decoder work and clear unsubmitted reviews. Hidden pages never automatically resume or read census data. Previously submitted local receipts are separate from a pending draft; deliberate withdrawal removes their contribution. **Stop and clear** in the addon disarms its session. Stop the server with Ctrl+C to discard the whole local census. No real observations, frame text, raw pixels or payloads should be saved in test logs or screenshots; record only bounded outcome metadata and source-file hashes.

Desktop and narrow/mobile viewport layouts can be tested on this computer. A physical phone’s loopback is the phone, not this PC. This tool does not arrange a physical-phone secure context, enable LAN access, bypass TLS or host the page publicly. Responsive testing is not physical camera acceptance.

The server serves count-guarded, hash-pinned overlays of the original pilot HTML/script. Original pilot files, protocol, decoder, Lua encoder and installed addon remain unchanged. `core.cjs` has an explicit isolated local-real one-guild option; the default synthetic contract remains unchanged. All production source, config, schema and control paths are unchanged.

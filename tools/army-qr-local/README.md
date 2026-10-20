# Local Army QR integration

This opt-in loopback preview connects the verified attended addon QR transfer to a served copy of the website. It does not alter production assets, Worker routes, settings, feature flags or launch gates.

From the repository root in PowerShell:

```powershell
$env:NODE_PATH='C:/path/to/existing/worker/node_modules'
node tools/army-qr-local/serve.cjs --port 49386
```

Use Node 24 and the already installed Worker dependencies. Do not change another checkout's package files to run this preview. See [REVIEW.md](REVIEW.md) for the exact main base, focused checks and qualification attribution. The synthetic PNG checks additionally use an existing Python runtime with Lupa 2.8; set `OLYMPUS_LUA_PYTHON` to its executable if it is not the default Python.

Open the printed loopback origin, select the fictional Member or Admin fixture and select **Community → Army · local QR preview**. Original News remains subject to its original switch. The local QR preview uses the original Worker's current Community read and applicant admission checks on every private request. The identities in this isolated website are fictional; real login and website writes are disconnected. This navigation is added to the served local copy; it adds no production Army page or talent changes.

**Open local QR transfer** embeds the original pilot, decoder and local census bridge. Choose an input deliberately, start a scan, decode all matching parts and use the observation locally within the original 30-second handoff. Review, local ownership consent, original intent and submission remain separate. Only the user's deliberately submitted aggregate frames reach this loopback process. Images remain in the browser; reports are memory-only. No production transport, storage service, LAN listener or account association is available.

Close, route exit, hiding the page and sign-out stop and clear capture and unsubmitted review. The normal CSRF-protected cancellation is dispatched before iframe removal, and new panels wait for its acknowledgement. Reopening is manual. Missing acknowledgement keeps the page closed without retry. Finish or check an in-progress operation in its original view before closing; an unknown submission never permits a replacement intent. Existing submitted receipts are separate, subject to normal withdrawal and process lifetime. Stop the process to discard its memory.

Keep the embedded Army page visible until its original operation is settled. Route exit, hiding and page exit remove that embedded recovery view. If its outcome or cancellation remains unresolved, another transfer stays blocked; returning does not recreate the original recovery UI. The paused page enables **Reopen** only after an exact successful cancellation acknowledgement. This boundary differs from the standalone attended pilot, whose original window may survive hiding.

This is a local integration preview, not a production Army feed. An unsigned volunteer observation proves neither source authenticity, membership, unique humans, complete guild coverage nor background freshness. A phone cannot reach the PC's loopback address. Mobile viewport checks do not establish a physical phone-camera transfer.

Focused checks are under `tests/`; the shared website and attended adapter retain their own regression checks. No package installation or full local test aggregate is required for this preview.

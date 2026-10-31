# Bolt project learnings

## 2026-10-30 - Organization module dependency chain
**Learning:** The overview renderer imports its own context module. Serially awaiting the independent main renderer adds an extra round trip before that chain can start. A cold synthetic trace at200ms test latency showed three serialized requests (637.8ms); this is not a production speed claim.
**Action:** Start the two fixed renderer imports together, then retain the original current-view check. Verify both completion and stale-view behavior; measure request overlap rather than inferring savings from bundle size.

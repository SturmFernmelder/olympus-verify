# Army QR production review stage

Status: code staged for review; no deployment or production collection is authorized.

The local Army QR transfer was tested on merged main `3d34aadb2cec356c23cb64c8f10cfe3ccc9516af` with one attended real addon observation. The same accepted observation was checked at desktop 1440 × 1000 and mobile 390 × 844 browser sizes, then withdrawn and cleared. This is local evidence, not a physical phone-camera test, source authentication or a production acceptance result. Real observations, QR frames, screenshots of capture and receipt tokens are excluded from this repository.

## What this candidate prepares

An admitted Community reader can open **Army** and see an explicit collection-disabled state. No totals are invented. The page has no live QR controls, form, iframe, capture, dynamic QR dependency or upload transport. Community OFF, sign-out, denial and the existing reader checks continue to apply. The existing Census preview retains its separate verified-character gate.

`scripts/build-army-qr-review.cjs --check` verifies a deterministic dormant package. The default command is read-only; `--write` is a deliberate local build operation. The manifest pins the reviewed statistics protocol, decoder, pilot, review-only CSS and existing jsQR/license. Three generated scripts retain the source behind an unconditional return with fixed `activation = false` and `uploads = false`. Changing a setting, environment variable, feature token or browser global cannot enable them. The decoder has one documented path-only projection to the already shipped, byte-identical jsQR library. There is no shipping pilot HTML or copy of the loopback bridge/server.

`/api/community/army/qr` and every child path are explicit 404 refusals for all methods, before the Community dispatcher reads the body or constructs its context. The fixed contract also says storage is disabled. The outer site entry retains its original authentication/admission work. There is no Army ingestion handler, writer, table, scheduled job, reporter account association or provider call.

The existing `/api/community/census/preview` is unchanged. Its `olympus-census-v1` JSON is a different format from OLCS1's `olympus-stat-observation-v1`, including masked `few`/`null` values. This candidate never routes QR frames to it or coerces masked values into numbers. Existing Census configuration is not an Army activation switch.

## Boundaries retained

| Boundary | Review-stage behavior |
| --- | --- |
| Capture and uploads | Unavailable; dormant scripts cannot start or process capture |
| Shared storage | No schema, migration, D1 report or background ingestion |
| Production controls | No settings, Wrangler, feature flag, binding, secret, permission or launch-gate change |
| Privacy and Native E2 | No identity OLG1/OLG2 integration, erasure, role, rank, appointment or entitlement effect |
| Browser policy | Original CSP, camera/display policy and frame restrictions preserved |
| Real QA data | Local only; excluded from source, manifests, PR and hosted fixtures |
| Local adapter | Original explicit picker, 30-second handoff, native 15-second request, 60-second snapshot, five-minute session, complete frames, clock refusals and masking retained |
| Unknown outcomes | No replacement intent, blind resubmission, cancellation-ACK shortcut or automatic adoption |

## Focused review commands

Use Node 24 and the existing Worker dependencies. Do not install packages to run these checks.

```text
node scripts/build-army-qr-review.cjs --check
node scripts/tests/army-qr-review.test.cjs
node worker/tests/army_qr_disabled_test.cjs
node worker/tests/army_qr_review_frontend_test.cjs
node scripts/check-projections.cjs --index
```

The new leaves are included in the existing hosted shard expansion. No original required status name, assertion, deadline or command is removed. The full local aggregate and its review loop remain stopped. Tests use only synthetic inputs; an earlier local real-transfer receipt is never relabeled as a fresh changed-candidate capture.

## Separate future gates

Enabled collection needs a separately reviewed implementation and owner authorization: genuine reporter admission, explicit informed consent, retention and withdrawal/export/erasure semantics, bounded storage, source limitations, request/intent/unknown-outcome discipline, route-scoped browser policy, adversarial tests, physical mobile capture and exact-version production acceptance. Unsigned volunteer aggregates cannot prove game origin, guild membership, complete all-guild coverage or unique humans. No toggle or deployment from this PR closes those gates.

# Retired qualification configuration

The owner permanently replaced the 334-suite pre-deployment aggregate, historical
static-source projection pins, and release-specific operator control loops on
10 November 2026. The active policy is [release-qualification.md](../release-qualification.md).

This directory retains inert configuration history. Files here are not CI jobs,
npm entrypoints, a release checklist or a requirement to repair old hash/string
fixtures. The old Army workflow is outside `.github/workflows` and cannot run
automatically. The old projection, census and shard CLIs report retirement and
exit nonzero rather than pretending they tested anything.

Individual historical test files and signed reports remain available for diagnosis.
Do not restore an aggregate gate or add source-hash/string oracles to the bounded
runtime checks. Replace a useful old regression with a focused observable-behavior
test when the changed area needs it. Preserve genuine failures as evidence.

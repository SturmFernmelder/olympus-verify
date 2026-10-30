# Sentinel

## 2026-10-30 — site JSON consumption

The existing site JSON limit counts UTF-16 units, not encoded bytes; retain valid multibyte input and native BOM/replacement behavior when bounding reads. Source changes to `site-core.ts` also need its exact runtime pin and reference/helper chain updated; that consistency check is separate from behavioral tests.

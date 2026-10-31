# Olympus Link upstream files (vendored, unmodified)

Build .186 copies three files of Daniel's Olympus addon repository byte for byte. They are never edited here.

| File here | Upstream path | Bytes | SHA-256 |
|---|---|---|---|
| `link-core.mjs` | `web/worker/link-core.mjs` | 81,304 | `53f05c183f96363f696dc6040fd3fb27fd11406f09b7bd908a7f579e72cb0e11` |
| `schema.sql` | `web/worker/schema.sql` | 7,325 | `a141dc14987bb834004473694e09c363f6a58cebd01952775e0d0099901657c9` |
| `LICENSE` | `LICENSE` | 1,083 | `a78bf4300e7768b9cc6d047816efe6a726f64c400e7e1a30d5a559757b892328` |

- Source: [`dnl-gentile/olympus-addon`](https://github.com/dnl-gentile/olympus-addon) at commit
  `d03ea8a9ce8d6d933dde9ce0f0ec7faa866a2df2`.
- Licence: MIT, "Copyright (c) 2026 Olympus addon contributors". `LICENSE` is the full notice, which goes with every
  copy. This is a third-party file set; the repository's own `LICENSE` does not cover it (`THIRD_PARTY_NOTICES.md`).
- `link-core.mjs` is not loaded as it is. `worker/scripts/build-link-core.mjs` checks all three SHA-256 pins and writes
  `worker/src/link-core.ts`: the same text with a generated header and six reviewed patch groups (P1 LINK_DB only, P2
  errorRef-only logging, P3 an injected fetch, P4 durable pending claims until role grant is confirmed, with authority
  and prune guards; P5 persistent deletion admission and exact owned cleanup/release; P6 corrected atomic issuance quotas and paired acknowledgements). The three upstream files above remain unmodified. `npm run check:link-core`, part of `npm test`,
  fails on any drift.
- `schema.sql` is the schema of the separate `olympus-link` D1 database (`LINK_DB`). The owner applies it once, during
  activation (`docs/olympus-link.md`). It is not part of `worker/schema.sql` and `ensureSchema` never runs it; the
  keeper database's schema rule does not apply to it.
- Updating to a newer upstream commit is a reviewed change of its own: replace the files, update the pins and the
  patches in the generator, regenerate, rebuild the test vectors (`worker/tests/fixtures/olympus-link/`: upstream's
  `web/test/fixtures/vectors.json` without its seed fields and the derivable backend token fields, as its `about`
  says) and their SHA-256 pin, and rerun `tests/link_integration_186_test.cjs`. Run upstream's own `web/test` suite at
  the new commit as well (it needs upstream's seeds and `web/public/core.js`, which are not vendored here) and record
  the result with the change: this repository ports only its seedless cases.

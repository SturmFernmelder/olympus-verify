# Optional census test fixtures

These are synthetic tests of the optional local consumer and pure server validator. They do not install an addon, parse player SavedVariables, upload, persist data, grant roles, authenticate an observation or prove native game/clipboard behavior. Original upstream1.2.3/API_VERSION1 does not provide GetCensusSnapshot; that missing-method assertion runs before the proposed same-chunk extension. The extension is a local proposal, not an adopted upstream API.

The exact V2 contract, own synthetic fixture and proposed extension are pinned in `pins.json`. The two upstream Data/Bridge files are not distributed here. Their repository, immutable commit URLs, sizes and SHA256 are recorded there. No verified copying grant was present in the inspected upstream subset; no license grant is asserted. The explicit `--fetch-upstream` option acquires only those two files into temporary storage, refuses redirects/size/hash mismatch and never falls back to a newer or cached version. Local `--upstream-dir` uses already available pinned files without network.

The Lua runner uses existing Lupa2.8's Lua5.1 runtime and executes actual pinned Data/Summary, original Bridge and the actual consumer. It then checks the exact original Bridge + LF + extension combined hash and executes it as one chunk so file-local masking is retained. No separate extension load or fabricated producer is allowed. Codec decoding remains unqualified: the original fixture supplies only a synthetic cap.

From the repository root, with an existing Python/Lupa environment, Node and the locked repository TypeScript dependency available:

```sh
python -E -P addon/tests/run_census_consumer.py --upstream-dir /path/to/pinned/upstream --run-dir artifacts/census-unique/lua
python -E -P addon/tests/run_census_server_chain.py --lua-receipt artifacts/census-unique/lua/run-receipt.json --evidence-root artifacts/census-unique --run-dir artifacts/census-unique/server
```

Both output directories must be new. Use the exact receipt just produced, never a latest-file glob. In CI, replace `--upstream-dir ...` with explicit `--fetch-upstream` and use a unique runner-temp root; Worker reuses the existing Lupa2.8 dependency alongside TypeScript. Node resolves from PATH or `--node`. Missing tools/runtime/files or upstream failure fail the run. No auto-install or interpreter substitution occurs in the drivers. `node worker/tests/community_census_validator_test.cjs` runs the strict183-case server suite by itself; it is also in `worker` test:all and intentionally retained inside the8-check chain.

The original89 Lua,183 server and8 chain assertions are preserved. Immutable inputs are checked before/after; current checkout inputs include the14 addon guard paths plus the consumer, validator, fixtures, drivers and relevant config. The historical34-path manifest checked two external addon trees; those original receipts remain historical, not a claim about this checkout. Same-chain receipts record current source, fixture and runtime pins. Exports and receipts remain in their explicit fresh evidence root and are hash-checked before/after. Changes to fixture/upstream pins require separate review.

Portable source packaging does not itself qualify Ubuntu CI, upstream adoption, real decoder, authenticated transport, native game UI, release or full CI. No upstream source, generated Bridge, historical exports, player data, binary runtime or dependency tree belongs in this fixture directory.

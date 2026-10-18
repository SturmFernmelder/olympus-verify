# Fast candidate projection check

This optional local pre-push hook checks the actual outgoing commit(s) supplied by Git. It reads Git blobs without
running candidate code, updating the index, refreshing hashes, generating files, using credentials or accessing the
network. Deleting a remote ref has no local tree to check. A failed check refuses the push with the stale pin's path.

Install with Node 24 and Git available on PATH. First inspect existing hook configuration:

```sh
git config --show-origin --get core.hooksPath
```

If a hook directory is already configured, keep it and integrate the command below into that directory's existing
pre-push hook. Do not replace other hooks. Otherwise opt in from the repository root:

```sh
git config --local core.hooksPath .githooks
```

Ensure `.githooks/pre-push` is executable on platforms that use executable bits. Installation is local and is not
performed by the checker. Git hooks are a convenience and can be bypassed; hosted CI remains authoritative.

```sh
node scripts/check-projections.cjs --index         # actual staged bytes; default if no flag is supplied
node scripts/check-projections.cjs --rev FULL_SHA  # exact committed candidate, even when HEAD differs
node scripts/check-projections.cjs --pre-push      # Git's four-field update lines on stdin
node scripts/tests/check-projections.test.cjs      # focused projection and Git-selection fixtures
```

Coverage: official asset/source/extractor byte pins and file modes; the reference→Python→V4 hash chain; network
guard pin; cursor source record and embedded metadata; governance book reader/model
and download tuples; required documents; policy root mirrors, generated bodies and source digest; runtime BUILD's
three health pins and its own deploy-checklist section. A newer CI-only release section does not change BUILD.
The pin graph is acyclic: update a changed asset's reviewed row, then the reference digest in `official_assets.py`,
then the affected V4 pins in `reconcile_public_root.py`. This tool only reports drift; it never updates those pins.

This fast check is not a test-suite, typecheck, full policy-generator, publication-resource, release, licensing or
production qualification. Required documents are checked for presence, not editorial correctness. An internally
consistent but incorrect change still needs review and CI. Timing is measured on the current host, not guaranteed
on every machine. The full existing assertions and deployment/publication permissions remain unchanged.
The reconciliation helper's historical `GENERATOR` capability pin is not a general current-source projection: its
old prepare path still refuses the newer policy generator. This check neither exercises nor relaxes that gate.

Git's [pre-push contract](https://git-scm.com/docs/githooks#_pre_push) specifies the stdin local SHA fields;
[`git cat-file --batch`](https://git-scm.com/docs/git-cat-file) supplies the exact corresponding blob bytes.

"""Hash any legacy cleartext dedupe keys in watcher-state.json.

Older builds stored dedupe keys verbatim, so the state file accumulated entries like "w:rough stroke:C44NMT" —
which is a live verification code, valid for the whole UTC day, sitting in a OneDrive-synced folder. The current
watcher stores a SHA-256 prefix instead (State._k). This rewrites the existing file to match, keeping every key
working as a dedupe marker while removing the codes themselves.

Stop the watcher and every other state writer first. Pending/retained custody is
not supported by this legacy-key migration and remains unchanged:
    python scrub_state.py [exact-state-path]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import sys

from custody_recovery import StateLease, private_create, regular_identity, reviewed_path


def scrub(path: pathlib.Path) -> dict[str, int]:
    # Master QA (28 Oct 2026): an old maintenance command must not bypass the
    # current writer lease or make an untracked copy of a retained proof body.
    path = reviewed_path(path)
    regular_identity(path)
    with StateLease(path):
        identity = regular_identity(path)
        raw = path.read_bytes()
        state = json.loads(raw)
        if not isinstance(state, dict):
            raise ValueError("state must be an object")
        seen = state.get("seen", [])
        outbox, pending = state.get("outbox", []), state.get("queue_written_pending", [])
        if (not isinstance(seen, list) or not all(isinstance(key, str) for key in seen)
                or not isinstance(outbox, list) or outbox or not isinstance(pending, list) or pending
                or state.get("queue_written_original") is not None):
            raise ValueError("legacy migration cannot handle malformed or pending custody")
        # State._k() in watcher.py: preserve existing digests and hash legacy
        # cleartext keys only. No other state field or original is scrubbed.
        hashed = [key if len(key) == 16 and all(c in "0123456789abcdef" for c in key)
                  else hashlib.sha256(key.encode("utf-8")).hexdigest()[:16] for key in seen]
        changed = sum(old != new for old, new in zip(seen, hashed))
        state["seen"] = hashed
        # Reject nonfinite metadata on both migration and no-op paths.
        after = json.dumps(state, allow_nan=False).encode("utf-8")
        if not changed:
            return {"keys": len(seen), "rewritten": 0}
        backup = path.with_suffix(".prescrub.json")
        tmp = path.with_name(path.name + ".scrub.tmp")
        if tmp.exists() or tmp.is_symlink():
            raise FileExistsError("existing migration temporary requires inspection")
        # The backup is also private state; never overwrite an earlier copy.
        # It contains the transformed state, not the legacy cleartext keys.
        with private_create(backup) as stream:
            stream.write(after)
            stream.flush()
            os.fsync(stream.fileno())
        if regular_identity(path) != identity or path.read_bytes() != raw:
            raise ValueError("state changed; backup retained, original not replaced")
        with private_create(tmp) as stream:
            stream.write(after)
            stream.flush()
            os.fsync(stream.fileno())
        if regular_identity(path) != identity or path.read_bytes() != raw:
            raise ValueError("state changed; private files retained for inspection")
        os.replace(tmp, path)
        if path.read_bytes() != after:
            raise ValueError("replacement readback differs; inspect without retrying")
        return {"keys": len(seen), "rewritten": changed}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("state", nargs="?", type=pathlib.Path, default=pathlib.Path("watcher-state.json"))
    args = parser.parse_args(argv)
    try:
        result = scrub(args.state)
        print(f"{result['keys']} dedupe keys, {result['rewritten']} rewritten from cleartext to a digest")
        print("No network request was made. Retain any private scrubbed backup for attended review.")
        return 0
    except (OSError, ValueError, TypeError, OverflowError, RecursionError):
        # Neither exception text nor source paths/payloads belong in the log.
        # A replace may have committed before raising: never claim rollback.
        print("Scrub refused or outcome requires inspection. Stop every state writer; preserve the state and any private migration files. No network request was made.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())

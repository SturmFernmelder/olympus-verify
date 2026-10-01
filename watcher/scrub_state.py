"""Hash any legacy cleartext dedupe keys in watcher-state.json.

Older builds stored dedupe keys verbatim, so the state file accumulated entries like "w:rough stroke:C44NMT" —
which is a live verification code, valid for the whole UTC day, sitting in a OneDrive-synced folder. The current
watcher stores a SHA-256 prefix instead (Watcher._k). This rewrites the existing file to match, keeping every key
working as a dedupe marker while removing the codes themselves.

Run it with the watcher stopped:
    python scrub_state.py
"""
import hashlib
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "watcher-state.json")
state = json.loads(path.read_text(encoding="utf-8"))
seen = state.get("seen") or []

# _k() in watcher.py — keep these in step.
hashed = [k if (len(k) == 16 and all(c in "0123456789abcdef" for c in k))
          else hashlib.sha256(k.encode("utf-8")).hexdigest()[:16]
          for k in seen]

cleartext = sum(1 for k in seen if k not in hashed)
state["seen"] = hashed

backup = path.with_suffix(".prescrub.json")
backup.write_text(json.dumps(state, indent=None), encoding="utf-8")  # structure only, already scrubbed
path.write_text(json.dumps(state), encoding="utf-8")

print(f"{len(seen)} dedupe keys, {cleartext} rewritten from cleartext to a digest")
print(f"wrote {path} (a scrubbed copy is at {backup.name}; delete it once you are happy)")

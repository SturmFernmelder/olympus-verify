#!/usr/bin/env python3
"""Create a private new-claim inventory; never send or change old records.

This reads no configuration or signing secret. The server must validate each
original signed observation, request and current roster. Output contains codes
and native proof MACs: keep it private and use only the attended admin page.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from collections import Counter, defaultdict
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "late_claim_codes285", Path(__file__).resolve().parents[1] / "watcher" / "codes.py")
assert _spec and _spec.loader
_codes = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_codes)


def canonical(value):
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def make_inventory(current, archive, current_hash, archive_hash):
    grouped = defaultdict(list)
    blocked = set()
    counts = Counter()
    intake = current.get("intake242", {})
    if not isinstance(intake, dict) or not isinstance(archive.get("originals"), list):
        raise ValueError("unsupported source structure")
    bodies = []
    for record in intake.values():
        body = record.get("body") if isinstance(record, dict) else None
        if isinstance(body, dict) and body.get("type") == "verify":
            bodies.append(("intake242", body))
    for record in archive["originals"]:
        if isinstance(record, dict) and record.get("path") == "/ingest/verify":
            body = record.get("body")
            if not isinstance(body, dict):
                raise ValueError("an archived verification record has no body")
            bodies.append(("quarantine", body))
    for origin, body in bodies:
        counts["storedVerificationObservations"] += 1
        code = body.get("code")
        if not isinstance(code, str):
            counts["unusableCodeObservations"] += 1
            continue
        key = _codes.normalize_code_input(code)
        if not key:
            counts["unusableCodeObservations"] += 1
            continue
        source = body.get("source")
        if source not in ("whisper", "mail"):
            # Do not silently omit an unsupported sender from a known code group.
            blocked.add(key)
            counts["unsupportedSourceObservations"] += 1
            continue
        grouped[key].append({
            "input": origin, "source": source,
            "character": body.get("character"), "guid": body.get("guid"),
            "code": code, "nativeMembership": body.get("nativeMembership"),
        })
    groups = []
    for key, observations in sorted(grouped.items()):
        # Preserve both source inventories, while eliminating byte-identical
        # duplicates within one source. No sender is selected or preferred.
        observations = list({canonical(row): row for row in observations}.values())
        if key in blocked:
            counts["groupsHeldForUnsupportedSource"] += 1
            continue
        if len(observations) > 32:
            counts["groupsHeldForSize"] += 1
            continue
        groups.append({"version": 285, "kind": "late-verification-claim",
                       "inventory": {"currentStateSHA256": current_hash,
                                     "quarantineSHA256": archive_hash},
                       "observations": observations})
    counts["submittedGroups"] = len(groups)
    counts["submittedObservations"] = sum(len(g["observations"]) for g in groups)
    counts["unsupportedSourceGroups"] = len(blocked)
    return {"version": 285, "kind": "late-verification-inventory",
            "scope": "Submitted current intake and immutable quarantine only; no global absence-of-conflict claim.",
            "counts": dict(counts), "groups": groups}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--expected-archive-sha256", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists():
        parser.error("output already exists; preserve it and choose a new file")
    if args.out.resolve() in (args.state.resolve(), args.archive.resolve()):
        parser.error("output must be separate from original records")
    state_bytes, archive_bytes = args.state.read_bytes(), args.archive.read_bytes()
    state_hash = hashlib.sha256(state_bytes).hexdigest()
    archive_hash = hashlib.sha256(archive_bytes).hexdigest()
    if archive_hash != args.expected_archive_sha256:
        parser.error("archive hash differs from the attended custody record")
    current, archive = json.loads(state_bytes), json.loads(archive_bytes)
    inventory = make_inventory(current, archive, state_hash, archive_hash)
    if json.loads(args.state.read_bytes()).get("intake242") != current.get("intake242"):
        parser.error("intake changed while reading; no inventory was saved")
    if hashlib.sha256(args.archive.read_bytes()).hexdigest() != archive_hash:
        parser.error("archive changed while reading; no inventory was saved")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("x", encoding="utf-8") as handle:
        json.dump(inventory, handle, ensure_ascii=True, separators=(",", ":"))
        handle.write("\n")
    print(json.dumps({"savedPrivateInventory": True,
                      "sha256": hashlib.sha256(args.out.read_bytes()).hexdigest(),
                      "counts": inventory["counts"], "networkRequests": 0,
                      "originalsChanged": False, "proofsValidated": False}))


if __name__ == "__main__":
    main()

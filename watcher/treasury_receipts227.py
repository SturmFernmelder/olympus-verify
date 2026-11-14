"""Local, unclassified gold-transfer receipts; never a role or tithe-credit writer.

The owner requested launch capture on 3 November 2026. Chat and SavedVariables
are two deliveries of the same addon receipt, not two payments. A durable local
commit precedes the watcher's source cursor. Client file flushing remains outside
our control. No character name is resolved into a Discord identity here.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import time
from pathlib import Path
from typing import Any

MAX_COPPER = 2_147_483_647
MAX_ROWS = 10_000
MAX_FILE_BYTES = 12 * 1024 * 1024
NOTE = re.compile(r"^Olympus: gold (?P<kind>trade|mail) (?P<incomingCopper>[0-9]{1,10}) paid (?P<outgoingCopper>[0-9]{1,10}) from (?P<sender>[^()|\[\]\r\n]{2,96}) \(id (?P<id>[0-9a-f]{24}), ts (?P<ts>[0-9]{9,11}), ref OLVt-(?P<mac>[0-9a-f]{32})\)$")


def normalize_name(value: str) -> str:
    """Same ASCII whitespace/case transform as Lua; retain the full realm suffix."""
    value = re.sub(r"[ \t\r\n\v\f]+", " ", value).strip(" ")
    return value.translate(str.maketrans("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"))


def _name(value: Any) -> bool:
    return isinstance(value, str) and 2 <= len(value.encode("utf-8")) <= 96 and value == value.strip(" ") and not any(ord(c) < 32 or ord(c) == 127 or c in "|()[]" for c in value)


def receipt_mac(secret: str, event: dict[str, Any]) -> str:
    message = "|".join(str(x) for x in ["gold", 1, event["id"], event["ts"], event["kind"], event["incomingCopper"], event["outgoingCopper"], normalize_name(event["sender"]), normalize_name(event["recipient"])])
    return hmac.new(secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()[:32]


def validated_receipt(event: Any, secret: str, recipient: str, at: int, retention_days: int = 30) -> dict[str, Any] | None:
    if not isinstance(event, dict) or type(event.get("version")) is not int or event["version"] != 1:
        return None
    fields = ("id", "ts", "kind", "incomingCopper", "outgoingCopper", "sender", "recipient", "mac")
    if not all(key in event for key in fields):
        return None
    e = {key: event[key] for key in fields}
    if not isinstance(e["id"], str) or not re.fullmatch(r"[0-9a-f]{24}", e["id"]):
        return None
    if e["kind"] not in ("trade", "mail") or not _name(e["sender"]) or not _name(e["recipient"]):
        return None
    if normalize_name(e["recipient"]) != normalize_name(recipient):
        return None
    if any(type(e[key]) is not int for key in ("ts", "incomingCopper", "outgoingCopper")):
        return None
    if not 0 < e["incomingCopper"] <= MAX_COPPER or not 0 <= e["outgoingCopper"] <= MAX_COPPER:
        return None
    if e["kind"] == "mail" and e["outgoingCopper"] != 0:
        return None
    if not at - retention_days * 86400 < e["ts"] <= at + 5:
        return None
    if not isinstance(e["mac"], str) or not re.fullmatch(r"[0-9a-f]{32}", e["mac"]) or not hmac.compare_digest(e["mac"], receipt_mac(secret, e)):
        return None
    return e


def parse_note(text: str, recipient: str) -> dict[str, Any] | None:
    match = NOTE.fullmatch(text)
    if not match:
        return None
    event: dict[str, Any] = match.groupdict()
    for key in ("ts", "incomingCopper", "outgoingCopper"):
        event[key] = int(event[key])
    event["recipient"] = recipient
    event["version"] = 1
    return event


class TreasuryJournal:
    """Bounded local atomic receipt journal. Failures never silently reset custody."""

    def __init__(self, path: Path, recipient: str = "Fern Melder", retention_days: int = 30):
        if not _name(recipient) or type(retention_days) is not int or not 1 <= retention_days <= 90:
            raise ValueError("invalid treasury journal configuration")
        self.path, self.recipient, self.retention_days = path, recipient, retention_days

    def _read(self) -> dict[str, Any]:
        if not self.path.exists():
            return {"version": 1, "classification": "unclassified_receipts", "receipts": {}}
        if self.path.stat().st_size > MAX_FILE_BYTES:
            raise ValueError("treasury journal exceeds bound; source must stay stopped")
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (ValueError, OSError) as error:
            raise ValueError("treasury journal unreadable; original retained") from error
        if not isinstance(data, dict) or data.get("version") != 1 or data.get("classification") != "unclassified_receipts" or not isinstance(data.get("receipts"), dict) or len(data["receipts"]) > MAX_ROWS:
            raise ValueError("invalid treasury journal; original retained")
        for key, row in data["receipts"].items():
            if not isinstance(row, dict) or row.get("id") != key or type(row.get("retainUntil")) is not int:
                raise ValueError("invalid treasury receipt custody; original retained")
        return data

    def record(self, event: dict[str, Any], secret: str, source: str, at: int | None = None) -> str:
        at = int(time.time()) if at is None else at
        if source not in ("signed-chat", "savedvariables"):
            raise ValueError("invalid treasury source")
        # The v1 decoder is historical, not authority for a new local payment.
        # A staged commit still has an unknown outcome: do not complete, replace
        # or erase it merely because prospective capture has been retired.
        if self._staged_path().exists():
            raise ValueError("treasury staged receipt requires attended recovery")
        data = self._read()
        e = validated_receipt(event, secret, self.recipient, at, self.retention_days)
        if e is None:
            return "refused"
        rows = data["receipts"]
        prior = rows.get(e["id"])
        canonical = {key: value for key, value in e.items() if key != "mac"}
        if prior:
            if any(prior.get(key) != value for key, value in canonical.items()):
                raise ValueError("treasury receipt id conflicts; original retained")
            return "duplicate"
        return "policy-held"  # new v1 observations have no native TITHE-reference proof

    def purge(self, at: int | None = None) -> int:
        """Independent of new transfers: quiet journals also lose expired names."""
        # A staged original may be a completed fsync whose replace was never
        # acknowledged. Do not erase or silently overwrite it as maintenance.
        # An exact frozen record replay may finish it; anything else is attended.
        if self._staged_path().exists():
            raise ValueError("treasury staged receipt requires attended recovery")
        if not self.path.exists():
            return 0
        at = int(time.time()) if at is None else at
        data = self._read()
        rows = {key: row for key, row in data["receipts"].items() if row["retainUntil"] > at}
        removed = len(data["receipts"]) - len(rows)
        if removed:
            data["receipts"] = rows
            self._write(data)
        return removed

    def _staged_path(self) -> Path:
        return self.path.with_suffix(self.path.suffix + ".tmp")

    def _write(self, data: dict[str, Any]) -> None:
        payload = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        encoded = payload.encode("utf-8")
        if len(encoded) > MAX_FILE_BYTES:
            raise ValueError("treasury journal exceeds bound; source must stay stopped")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self._staged_path()
        try:
            stream = temporary.open("x", encoding="utf-8", newline="\n")
        except FileExistsError:
            # Retry only the same complete frozen payload. A different receipt,
            # timestamp/source metadata or partial write must preserve BOTH
            # original files and stop for attended inspection (AA-W61 custody).
            with temporary.open("rb") as staged:
                frozen = staged.read(MAX_FILE_BYTES + 1)
            if frozen != encoded:
                raise ValueError("treasury staged receipt differs; attended recovery required")
        else:
            with stream:
                stream.write(payload)
                stream.flush()
                os.fsync(stream.fileno())
        os.replace(temporary, self.path)

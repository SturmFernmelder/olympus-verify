"""Owned local correspondence removal and denial only; never original/effect authority."""
from __future__ import annotations
import copy
import json
import math
import os
import re
import time

FIELD = "localPrivacyDisposition280"
PURPOSE = "old-captured-correspondence-local-only"
ADDON_FIELD = "localCorrespondence280"
ADDON_PURPOSE = "financial-correspondence-local-only-v1"
LEGACY = {"mail", "trade", "whisper-declaration", "treasury-receipt242"}
_BODY = {"id", "type", "source", "character", "guid", "guidSource", "requestedAt", "requestedBy", "status", "clientVersion", "guild", "realm", "observedAt", "donation", "evidence", "attempts", "outcome", "acknowledgedAt", "serverReceipt"}
_DONATION = {"copper", "outgoingCopper", "items", "note"}
_ID = re.compile(r"[A-Za-z0-9:._-]{1,128}")
_RID = re.compile(r"(?:[0-9a-f]{24}|[0-9a-f]{32})")
_LIMITS = {"tables": 65536, "fields": 262144, "depth": 32, "bytes": 16777216}


class LocalCorrespondenceHeld(ValueError):
    pass


def load_owned_state(raw):
    """One original State read: never accept a collapsed duplicate/nonfinite graph."""
    def pairs(values):
        result = {}
        for key, value in values:
            if key in result:
                raise LocalCorrespondenceHeld("owned state duplicate key")
            result[key] = value
        return result
    def nonfinite(_value):
        raise LocalCorrespondenceHeld("owned state nonfinite value")
    def finite_float(value):
        parsed = float(value)
        if not math.isfinite(parsed):
            return nonfinite(value)
        return parsed
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=nonfinite, parse_float=finite_float)


def _bounded(value, numeric_keys=False):
    cost = dict(tables=0, fields=0, bytes=0)
    seen = set()
    def visit(v, depth):
        if depth > _LIMITS["depth"]:
            raise LocalCorrespondenceHeld("local privacy depth held")
        kind = type(v)
        if kind is str:
            cost["bytes"] += len(v.encode("utf-8"))
            if cost["bytes"] > _LIMITS["bytes"]:
                raise LocalCorrespondenceHeld("local privacy bytes held")
        elif kind is float:
            if not math.isfinite(v):
                raise LocalCorrespondenceHeld("local privacy value held")
        elif v is None or kind in (int, bool):
            pass
        elif kind in (dict, list):
            if id(v) in seen:
                raise LocalCorrespondenceHeld("local privacy alias held")
            seen.add(id(v)); cost["tables"] += 1
            if cost["tables"] > _LIMITS["tables"]:
                raise LocalCorrespondenceHeld("local privacy tables held")
            for key, child in v.items() if kind is dict else enumerate(v):
                cost["fields"] += 1
                if cost["fields"] > _LIMITS["fields"]:
                    raise LocalCorrespondenceHeld("local privacy fields held")
                if kind is dict:
                    if type(key) is not str and not (numeric_keys and type(key) is int):
                        raise LocalCorrespondenceHeld("local privacy key held")
                    visit(key, depth + 1)
                visit(child, depth + 1)
        else:
            raise LocalCorrespondenceHeld("local privacy format held")
    visit(value, 0)
    return cost


def legacy(body):
    return type(body) is dict and body.get("type") == "donation" and type(body.get("source")) is str and body["source"] in LEGACY


def financial(body):
    return type(body) is dict and (body.get("type") == "donation" or "donation" in body)


def disposition_valid(row):
    m = row.get(FIELD) if type(row) is dict else None
    return (type(m) is dict and set(m) == {"version", "purpose", "reason", "removedAt", "relayEligible"}
            and type(m["version"]) is int and m["version"] == 1 and m["purpose"] == PURPOSE
            and m["reason"] == "owner-requested-text-blanked" and type(m["removedAt"]) is int
            and 0 < m["removedAt"] <= 253402300799 and m["relayEligible"] is False)


def local_only(row):
    # Presence of malformed protective metadata is also denial, never authority.
    return type(row) is dict and (FIELD in row or legacy(row.get("body")))


def prepare(state, at):
    """Return candidate/status. A failed scoped preflight never partially edits rows."""
    current = state.d
    status = dict(available=True, complete=True, held=False, reason="scoped-minimization-complete", blankedNotes=0, localOnlyRows=0)
    if "intake242" not in current:
        return None, status
    ledger = current["intake242"]
    try:
        if type(ledger) is not dict:
            raise LocalCorrespondenceHeld("local privacy ledger held")
        status["cost"] = _bounded(ledger)
        selected = []
        for eid, row in ledger.items():
            if type(row) is not dict:
                # Unknown originals remain untouched, not repaired into eligible rows.
                raise LocalCorrespondenceHeld("local privacy row held")
            if FIELD in row and not disposition_valid(row):
                raise LocalCorrespondenceHeld("local privacy disposition held")
            if local_only(row):
                status["localOnlyRows"] += 1
            body = row.get("body")
            if not legacy(body):
                continue
            donation = body.get("donation")
            if (type(eid) is not str or _ID.fullmatch(eid) is None or body.get("id") != eid
                    or not set(body) <= _BODY or type(donation) is not dict or not set(donation) <= _DONATION
                    or "note" in donation and type(donation["note"]) is not str):
                raise LocalCorrespondenceHeld("local privacy original held")
            if donation.get("note"):
                selected.append(eid)
        if not selected:
            return None, status
        if type(at) is not int or not 0 < at <= 253402300799:
            raise LocalCorrespondenceHeld("local privacy clock held")
        replacement = copy.deepcopy(ledger)
        for eid in selected:
            row = replacement[eid]
            row["body"]["donation"]["note"] = ""
            if FIELD not in row:
                row[FIELD] = dict(version=1, purpose=PURPOSE, reason="owner-requested-text-blanked", removedAt=at, relayEligible=False)
        # Generated protective metadata must fit the same complete-scope limits.
        status["cost"] = _bounded(replacement)
        candidate = dict(current); candidate["intake242"] = replacement
        status["blankedNotes"] = len(selected)
        return candidate, status
    except (LocalCorrespondenceHeld, UnicodeError, ValueError, TypeError, OverflowError, RecursionError):
        status.update(complete=False, held=True, reason="scoped-minimization-incomplete", blankedNotes=0)
        return None, status


def initialize(state):
    # atomic_local_text uses this exact fixed staging name. It is never ours to adopt.
    tmp = state.path.with_suffix(".tmp")
    if os.path.lexists(tmp):
        raise LocalCorrespondenceHeld("retained staged state; local privacy stopped")
    original = state.d
    candidate, status = prepare(state, int(time.time()))
    if candidate is not None:
        if os.path.lexists(tmp):
            raise LocalCorrespondenceHeld("retained staged state; local privacy stopped")
        state.d = candidate
        try:
            state.save()
        except (OSError, ValueError, TypeError, OverflowError, RecursionError):
            state.d = original
            raise
    return status


def _integer(v):
    return type(v) in (int, float) and math.isfinite(v) and v >= 0 and v == math.floor(v) and v <= 9007199254740991


def addon_target_denied(intake, eid):
    """A known exact map entry remains denial when unrelated metadata is malformed."""
    if type(eid) is not str or _RID.fullmatch(eid) is None or type(intake) is not dict:
        return False
    m = intake.get(ADDON_FIELD)
    if (type(m) is not dict or type(m.get("version")) not in (int, float) or m["version"] != 1
            or m.get("purpose") != ADDON_PURPOSE):
        return False
    return any(type(m.get(key)) is dict and m[key].get(eid) is True
               for key in ("blockedIds", "blockedTransferIds"))


def addon_marker(intake):
    """Closed addon metadata is only a deny set; invalid metadata never grants trust."""
    if type(intake) is not dict or ADDON_FIELD not in intake:
        return frozenset(), False
    m = intake[ADDON_FIELD]
    try:
        _bounded(m, numeric_keys=True)
        if (type(m) is not dict or set(m) != {"version", "purpose", "blockedIds", "blockedTransferIds", "retiredDeclarations", "stats"}
                or type(m["version"]) not in (int, float) or m["version"] != 1 or m["purpose"] != ADDON_PURPOSE):
            raise ValueError()
        blocked = set()
        for key in ("blockedIds", "blockedTransferIds"):
            values = m[key]
            if type(values) is not dict:
                raise ValueError()
            for eid, value in values.items():
                if type(eid) is not str or _RID.fullmatch(eid) is None or value is not True:
                    raise ValueError()
                blocked.add(eid)
        retired = m["retiredDeclarations"]
        if type(retired) is dict:
            # SavedVariables Lua arrays can be represented by their dense integer keys.
            if set(retired) != set(range(1, len(retired) + 1)):
                raise ValueError()
            retired = list(retired.values())
        if type(retired) is not list:
            raise ValueError()
        for entry in retired:
            if (type(entry) is not dict or set(entry) != {"entryId", "reason"} or type(entry["entryId"]) is not str
                    or _RID.fullmatch(entry["entryId"]) is None or entry["reason"] != "retired-local-correspondence-key-v1"):
                raise ValueError()
        stats = m["stats"]
        if type(stats) is not dict or set(stats) != {"blankedLeaves", "retiredKeyCount", "blockedOriginals", "blockedTransfers"} or not all(_integer(v) for v in stats.values()):
            raise ValueError()
        return frozenset(blocked), False
    except (ValueError, TypeError, UnicodeError, OverflowError, RecursionError):
        return frozenset(), True

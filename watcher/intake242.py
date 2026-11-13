"""Durable addon observations; unknown verification effects are never automatically retried."""
from __future__ import annotations
import hashlib
import hmac
import json
import math
import time
import re
import codes
import savedvars
import savedvars_source280
import intake_schema280
PATH = "/ingest/intake242"
SOURCE_VERSION = "0.6.25"

# These are value-tree bounds, not authority or a financial schema. Native rows
# contain at most16 attachment records; the existing remote wire is8KiB,
# depth5/500values. Leave room for the complete local native proof factories
# and nested lists without accepting an unbounded SavedVariables JSON body.
MAX_BODY_BYTES = 65_536
MAX_BODY_DEPTH = 8
MAX_BODY_VALUES = 4_096
MAX_CONTAINER_ITEMS = 1_024
_VOLATILE = ("status", "acknowledgedAt", "outcome", "attempts", "serverReceipt")


def _canonical_body(entry):
    """Refuse a whole malformed row before sorted serialization; never repair it."""
    if type(entry) is not dict or len(entry) > MAX_CONTAINER_ITEMS or any(type(k) is not str for k in entry):
        return None
    body = {k: v for k, v in entry.items() if k not in _VOLATILE}
    remaining, values, active = MAX_BODY_BYTES, 0, set()

    def consume(size):
        nonlocal remaining
        remaining -= size
        if remaining < 0:
            raise ValueError("intake value size")

    def string(value):
        if len(value) > MAX_BODY_BYTES:
            raise ValueError("intake string size")
        # UTF8 encoding refuses lone surrogates. Account for the exact JSON
        # escapes without allocating a sorted or potentially huge JSON body.
        size = len(value.encode("utf-8")) + 2
        for char in value:
            if char in ('"', '\\'):
                size += 1
            elif ord(char) < 32:
                size += 1 if char in '\b\f\n\r\t' else 5
        consume(size)

    def visit(value, depth):
        nonlocal values
        values += 1
        if values > MAX_BODY_VALUES or depth > MAX_BODY_DEPTH:
            raise ValueError("intake value bounds")
        kind = type(value)
        if value is None:
            consume(4)
        elif kind is bool:
            consume(4 if value else 5)
        elif kind is str:
            string(value)
        elif kind is int:
            if abs(value) > 9_007_199_254_740_991:
                raise ValueError("intake integer bounds")
            consume(len(str(value)))
        elif kind is float:
            if not math.isfinite(value):
                raise ValueError("intake finite number")
            consume(len(repr(value)))
        elif kind in (dict, list):
            if len(value) > MAX_CONTAINER_ITEMS or id(value) in active:
                raise ValueError("intake container bounds")
            active.add(id(value))
            consume(2 + max(0, len(value) - 1))
            if kind is dict:
                for key, child in value.items():
                    if type(key) is not str:
                        raise ValueError("intake object key")
                    string(key)
                    consume(1)
                    visit(child, depth + 1)
            else:
                for child in value:
                    visit(child, depth + 1)
            active.remove(id(value))
        else:
            raise ValueError("intake value type")

    try:
        visit(body, 0)
        raw = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
        if len(raw.encode("utf-8")) > MAX_BODY_BYTES:
            return None
        return body, hashlib.sha256(raw.encode("utf-8")).hexdigest()
    except (ValueError, TypeError, OverflowError, RecursionError):
        return None


def _save_state(watcher):
    # A failed save may have committed. Never classify journal/serialization
    # failures as recoverable source input or continue into another relay lane.
    try:
        watcher.state.save()
    except (OSError, ValueError, TypeError, OverflowError, RecursionError):
        watcher._custody_halted = True
        raise

def _financial_original_matches(original, receipt):
    fields = {"id", "character", "guid", "observedAt", "bodySHA256", "outcome", "originalNoEffect"}
    if (type(receipt) is not dict or set(receipt) != fields or receipt["originalNoEffect"] is not True
            or receipt["outcome"] != "receipt_collector_pending"):
        return False
    body = original.get("body")
    canonical = _canonical_body(body)
    return (canonical is not None and type(body) is dict and body.get("source") == intake_schema280.V2
            and receipt["id"] == body.get("id") and receipt["character"] == body.get("character")
            and receipt["guid"] == body.get("guid") and type(receipt["observedAt"]) is int
            and receipt["observedAt"] == body.get("requestedAt") and type(receipt["bodySHA256"]) is str
            and re.fullmatch(r"[0-9a-f]{64}", receipt["bodySHA256"]) is not None
            and receipt["bodySHA256"] == original.get("sha256") == canonical[1])


def _financial_retry_witness(watcher, original):
    """Never adopt serialized metadata as a fresh server receipt after restart."""
    witness = getattr(watcher, "_tithe_no_effect280", {}).get(id(original))
    metadata = original.get("collectorRetry280")
    if (type(witness) is not dict or witness.get("original") is not original or type(metadata) is not dict
            or metadata.get("spent") is not False or metadata != witness.get("metadata")
            or not _financial_original_matches(original, metadata.get("receipt"))):
        return None
    return witness


def _schedule_financial_retry(watcher, original, receipt, at):
    if not _financial_original_matches(original, receipt):
        return
    metadata = {"spent": False, "nextAt": at + 60, "receipt": dict(receipt)}
    original["collectorRetry280"] = metadata
    known = getattr(watcher, "_tithe_no_effect280", None)
    if known is None:
        known = watcher._tithe_no_effect280 = {}
    known[id(original)] = {"original": original, "metadata": {**metadata, "receipt": dict(receipt)}}


def _transport_identity_error(body):
    # Worker ordinary ACKs preserve at most100 UTF16 code units. Reject new
    # unsupported identities; retained originals are held, never truncated/id-only matched.
    character = body.get("character") if type(body) is dict else None
    try:
        return type(character) is not str or len(character.encode("utf-16-le")) // 2 > 100
    except UnicodeError:
        return True


def collect(watcher, snapshot=None):
    state = watcher.state.d.get("intake242", {})
    if type(state) is not dict:
        watcher._custody_halted = True
        raise ValueError("intake custody ledger held")
    if snapshot is None:
        try:
            snapshot = savedvars_source280.owned(watcher)
        except savedvars_source280.SourceUnavailable:
            return state
    db = snapshot.data.get("OlympusVerifyDB")
    if type(db) is not dict:
        return state
    intake = db.get("intake242")
    rows = intake.get("entries") if type(intake) is dict else None
    values = rows.values() if type(rows) is dict else rows if type(rows) is list else ()
    changed, invalid = False, 0
    for entry in values:
        if type(entry) is not dict:
            invalid += 1
            continue
        eid = entry.get("id")
        if type(eid) is not str or re.fullmatch(r"[A-Za-z0-9:._-]{1,128}", eid) is None:
            invalid += 1
            continue
        canonical = _canonical_body(entry)
        if canonical is None:
            invalid += 1
            continue  # invalid input cannot taint an already held original
        body, digest = canonical
        metadata = intake.get("bridgeMetadata")
        # Historical foreign mirrors remain in SavedVariables and custody state.
        # They are neither re-imported nor upgraded into owned observations.
        if type(metadata) is dict and eid in metadata:
            invalid += 1
            continue
        policy = intake_schema280.policy_error(body, watcher.secret, watcher.officer)
        if policy or body.get("type") != "donation" and _transport_identity_error(body):
            invalid += 1
            continue
        original = state.get(eid)
        if original is None:
            watcher.state.d["intake242"] = state
            state[eid] = {"body": body, "sha256": digest, "state": "pending", "attempted": False}
            changed = True
        elif type(original) is not dict:
            watcher._custody_halted = True
            raise ValueError("intake custody row held")
        elif original.get("sha256") != digest and original.get("sourceConflict") is not True:
            original["sourceConflict"] = True
            changed = True
    diagnosis = getattr(watcher, "_source_counts280", None)
    if diagnosis is not None:
        diagnosis("intake", invalid)
    if changed:
        _save_state(watcher)
    return state


def _ordinary_no_effect_matches(original, receipt):
    body = original.get("body")
    canonical = _canonical_body(body)
    return (type(receipt) is dict and set(receipt) == {"id", "character", "guid", "outcome", "originalNoEffect"}
            and receipt.get("originalNoEffect") is True and receipt.get("outcome") in
                ("membership_source_pending", "approved_branch_authority_pending")
            and canonical is not None and canonical[1] == original.get("sha256")
            and type(body) is dict and body.get("type") in ("verify", "role", "guild")
            and receipt.get("id") == body.get("id") and receipt.get("character") == body.get("character")
            and receipt.get("guid") == body.get("guid", ""))


def _ordinary_retry_witness(watcher, original):
    witness = getattr(watcher, "_intake_no_effect280", {}).get(id(original))
    metadata = original.get("retrySchedule280")
    canonical = _canonical_body(original.get("body"))
    if (type(witness) is not dict or witness.get("original") is not original
            or canonical is None or witness.get("bodySHA256") != canonical[1]
            or canonical[1] != original.get("sha256")
            or witness.get("binding") != watcher._delivery_binding() or type(metadata) is not dict
            or metadata != witness.get("metadata") or metadata.get("spent") is not False
            or not _ordinary_no_effect_matches(original, metadata.get("receipt"))):
        return None
    return witness


def _schedule_ordinary_retry(watcher, original, receipt, at):
    if not _ordinary_no_effect_matches(original, receipt):
        return
    delay = 300 if receipt["outcome"] == "approved_branch_authority_pending" else 60
    metadata = {"spent": False, "nextAt": at + delay, "receipt": dict(receipt)}
    original["retrySchedule280"] = metadata
    known = getattr(watcher, "_intake_no_effect280", None)
    if known is None:
        known = watcher._intake_no_effect280 = {}
    known[id(original)] = {"original": original, "binding": watcher._delivery_binding(),
                           "bodySHA256": _canonical_body(original["body"])[1],
                           "metadata": {**metadata, "receipt": dict(receipt)}}


def drain(watcher, collect_inputs=True):
    state = collect(watcher) if collect_inputs else watcher.state.d.get("intake242", {})
    if type(state) is not dict:
        watcher._custody_halted = True
        raise ValueError("intake custody ledger held")
    if watcher.worker.paused() or watcher._custody_halted:
        return
    batch, changed, at = [], False, int(time.time())
    items = list(state.values())
    offset = getattr(watcher, "_intake_cursor280", 0) % max(1, len(items))
    ordered = items[offset:] + items[:offset]
    for position, original in enumerate(ordered):
        if type(original) is not dict:
            watcher._custody_halted = True
            raise ValueError("intake custody row held")
        policy = intake_schema280.policy_error(original.get("body"), watcher.secret, watcher.officer)
        if policy:
            if original.get("policyHold") != policy:
                original["policyHold"] = policy
                changed = True
            continue
        canonical = _canonical_body(original.get("body"))
        if canonical is None or canonical[1] != original.get("sha256"):
            if original.get("policyHold") != "intake_original_integrity_held":
                original["policyHold"] = "intake_original_integrity_held"
                changed = True
        if not policy and original.get("body", {}).get("type") != "donation" and _transport_identity_error(original.get("body")):
            if original.get("policyHold") != "transport_identity_held":
                original["policyHold"] = "transport_identity_held"
                changed = True
        if original.get("policyHold"):
            continue  # original remains held for attended review; never silently renew/re-authorize it
        if original.get("sourceConflict") or original.get("state") != "pending":
            continue
        # A loaded falsey/missing field is not evidence of a known unsent
        # original. Preserve the malformed value and all original bytes; this
        # fixed metadata hold does not classify any delivery outcome.
        if type(original.get("attempted")) is not bool:
            if original.get("custodyHold280") != "attempt_state_unqualified":
                original["custodyHold280"] = "attempt_state_unqualified"
                changed = True
            continue
        if original.get("custodyHold280"):
            continue
        if original["body"].get("type") == "donation" and original["attempted"] is True:
            witness = _financial_retry_witness(watcher, original)
            if witness is None:
                original["state"] = "outcome_unknown"
                changed = True
                continue
            if witness["metadata"]["nextAt"] > at:
                continue
        if original["body"].get("type") != "donation" and original["attempted"] is True:
            witness = _ordinary_retry_witness(watcher, original)
            if witness is None:
                original["state"] = "outcome_unknown"
                changed = True
                continue
            if witness["metadata"]["nextAt"] > at:
                continue
        batch.append(original)
        watcher._intake_cursor280 = (offset + position + 1) % max(1, len(items))
        if len(batch) == 25:
            break
    if not batch:
        if changed:
            _save_state(watcher)
        return
    for original in batch:
        original["attempted"] = True
        witness = _financial_retry_witness(watcher, original)
        if witness is not None:
            # Spend and persist before dispatch. Failed persistence is a global
            # custody halt; an unknown reply cannot reuse this original receipt.
            original["collectorRetry280"] = {**witness["metadata"], "spent": True}
            watcher._tithe_no_effect280.pop(id(original), None)
        ordinary = _ordinary_retry_witness(watcher, original)
        if ordinary is not None:
            original["retrySchedule280"] = {**ordinary["metadata"], "spent": True}
            watcher._intake_no_effect280.pop(id(original), None)
    _save_state(watcher)
    selected = {r["body"]["id"]: r for r in batch}
    # Transport receives a copy; it cannot mutate the frozen custody original.
    payload = json.loads(json.dumps({"entries": [r["body"] for r in batch]}, allow_nan=False))
    okay, response = watcher.worker.call("POST", PATH, payload, retries=1)
    if not okay or not isinstance(response, dict) or response.get("version") != 242:
        return
    holds = response.get("policyHolds")
    for hold in holds if isinstance(holds, list) else []:
        if isinstance(hold, dict) and type(hold.get("id")) is str and hold.get("outcome") == "intake_policy_held":
            original = selected.get(hold.get("id"))
            if original is not None:
                original["policyHold"] = "server_intake_policy_held"
    deferred = response.get("deferred")
    for receipt in deferred if isinstance(deferred, list) else []:
        if type(receipt) is not dict or type(receipt.get("id")) is not str:
            continue
        if isinstance(receipt, dict) and receipt.get("outcome") == "receipt_collector_pending":
            original = selected.get(receipt.get("id"))
            if original and original["body"].get("source") == intake_schema280.V2:
                _schedule_financial_retry(watcher, original, receipt, at)
        if isinstance(receipt, dict) and receipt.get("originalNoEffect") is True and receipt.get("outcome") in ("membership_source_pending", "approved_branch_authority_pending"):
            original = selected.get(receipt.get("id"))
            if original is not None:
                _schedule_ordinary_retry(watcher, original, receipt, at)
    receipts = response.get("acknowledgements")
    if not isinstance(receipts, list):
        _save_state(watcher)
        return
    for receipt in receipts:
        if not isinstance(receipt, dict) or type(receipt.get("id")) is not str or receipt.get("status") not in ("done", "rejected"):
            continue
        original = selected.get(receipt.get("id"))
        if (original is None or receipt.get("character") != original["body"].get("character", original["body"].get("name"))
                or original["body"].get("guid") and receipt.get("guid") != original["body"]["guid"]
                or _canonical_body(original["body"]) != (original["body"], original.get("sha256"))):
            continue
        original["state"] = receipt["status"]
        original["receipt"] = {k:receipt.get(k, "") for k in ("id","status","character","guid","discordRole","outcome")}
        original["acknowledgedAt"] = int(time.time())
    _save_state(watcher)

def receipts(watcher):
    at = int(time.time())
    result = []
    for original in watcher.state.d.get("intake242", {}).values():
        if original.get("state") not in ("done", "rejected") or not isinstance(original.get("receipt"), dict):
            continue
        receipt = dict(original["receipt"])
        if receipt.get("guid") is None:
            receipt["guid"] = ""
        observed = int(original.get("acknowledgedAt") or 0)
        if observed <= 0 or observed > at + 5:
            continue
        # Terminal ACK delivery is available only for its original24h window.
        # Keep the original ledger/body/ACK indefinitely until owner retention
        # policy says otherwise; this is projection visibility, never erasure.
        expires = observed + 86400
        if at >= expires:
            continue
        receipt.update(observedAt=observed, expiresAt=expires)
        message = "|".join(str(x) for x in ("intake242",receipt["id"],receipt["status"],receipt.get("guid") or "",codes.normalize_character(receipt["character"]),receipt.get("discordRole") or "",observed,expires))
        receipt["mac"] = hmac.new(watcher.secret.encode(),message.encode(),hashlib.sha256).hexdigest()[:32]
        result.append(receipt)
    return result

def handles_verify(watcher, name, code, event=None):
    """Suppress only the same serialized observation, never all uses of a code.

    An old rejected/spent/unknown row remains immutable. A fresh native whisper
    has its own observation ID and original proof; this does not reset a claim.
    Older addon rows may match only their exact GUID/proof/time observation.
    """
    if not isinstance(event, dict):
        return False
    observed_name = event.get("target") or name
    for original in watcher.state.d.get("intake242", {}).values():
        body = original.get("body", {})
        if (body.get("type") != "verify" or body.get("source") != event.get("type")
                or codes.normalize_character(str(body.get("character") or body.get("name") or "")) != codes.normalize_character(observed_name)
                or body.get("code") != code):
            continue
        observation = event.get("observationId")
        if observation is not None:
            if isinstance(observation, str) and re.fullmatch(r"[0-9a-f]{32}", observation) and body.get("observationId") == observation:
                return True
            continue
        # Equality can identify the same old missing-proof observation too; it
        # never turns an absent/invalid proof into membership authority.
        if (not body.get("observationId") and type(event.get("ts")) is int and event["ts"] > 0
                and body.get("guid") == event.get("guid")
                and body.get("nativeMembership") == event.get("nativeMembership") and body.get("observedAt") == event["ts"]):
            return True
    return False

def verification_results(watcher, response):
    rows = response.get("verificationResults") if isinstance(response, dict) else None
    result = []
    at = int(time.time())
    for r in rows if isinstance(rows, list) else []:
        if not isinstance(r, dict) or not codes.is_guid(r.get("guid")) or not isinstance(r.get("character"), str) or r.get("status") not in ("verified", "pending-role"):
            continue
        observed, expires = r.get("observedAt"), r.get("expiresAt")
        if type(observed) is not int or type(expires) is not int or not observed <= at+5 or not at < expires <= observed+300:
            continue
        row = {k:r.get(k) or "" for k in ("guid","character","status","discordRole","observedAt","expiresAt")}
        message = "|".join(str(x) for x in ("verification242",row["guid"],codes.normalize_character(row["character"]),row["status"],row["discordRole"],observed,expires))
        row["mac"] = hmac.new(watcher.secret.encode(),message.encode(),hashlib.sha256).hexdigest()[:32]
        result.append(row)
    return result

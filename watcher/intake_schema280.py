"""Closed transport shapes for actual native factories; no payment/role authority."""
from __future__ import annotations

import hashlib
import hmac
import re
import time

COLLECTOR = "Fern Melder"
V2 = "tithe-gold-v2"
RETENTION_SECONDS = 30 * 86400
MAX_COPPER = 2_147_483_647
_GUID = re.compile(r"Player-[0-9]+-[0-9A-Fa-f]+")
_HEX32 = re.compile(r"[0-9a-f]{32}")
_BASE = {"id", "type", "source", "character", "guid", "requestedAt", "requestedBy", "guild", "realm", "clientVersion"}
_FINANCIAL = _BASE | {"donation", "evidence"}
_VERIFY = _BASE | {"name", "code", "nativeMembership", "locallyValid", "guidSource", "observationId", "observedAt", "rankName", "rankIndex", "bridgeUntrusted", "bridgeSender", "mailProof242"}
_ROLE = _BASE | {"name", "nativeDiscord", "observedAt", "rankName", "rankIndex", "bridgeUntrusted", "bridgeSender"}


def normalize_full_name(value: str) -> str:
    """Lua's ASCII-only transform, retaining the complete realm suffix."""
    value = re.sub(r"[ \t\r\n\v\f]+", " ", value).strip(" ")
    return value.translate(str.maketrans("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"))


def _text(value, maximum=96, minimum=1):
    if type(value) is not str:
        return False
    try:
        return minimum <= len(value.encode("utf-8")) <= maximum and not any(ord(c) < 32 or ord(c) == 127 for c in value)
    except UnicodeError:
        return False


def _name(value, maximum=96):
    return _text(value, maximum, 2) and not any(c in value for c in "|()[]")


def _integer(value, low=1, high=9_007_199_254_740_991):
    return type(value) is int and low <= value <= high


def _guid(value, empty=False):
    return empty and value == "" or _text(value, 64) and _GUID.fullmatch(value) is not None


def _object(value, allowed, required=None):
    return type(value) is dict and all(type(k) is str for k in value) and set(value) <= allowed and (required is None or required <= set(value))


def tithe_message(body):
    d, e = body["donation"], body["evidence"]
    fields = [body["id"], str(body["requestedAt"]), d["kind"], str(d["copper"]),
              normalize_full_name(body["character"]), body["guid"], normalize_full_name(d["recipient"]),
              d["collectorGuid"], body["guild"], body["realm"], d["reference"], body["clientVersion"], e["kind"], d["recipient"]]
    return "tithe-gold-v2|" + "".join(str(len(v.encode("utf-8"))) + ":" + v for v in fields)


def tithe_mac(secret, body):
    return hmac.new(secret.encode("utf-8"), tithe_message(body).encode("utf-8"), hashlib.sha256).hexdigest()[:32]


def financial_error(body, secret, officer=None, at=None):
    if not _object(body, _FINANCIAL, _FINANCIAL) or body.get("type") != "donation" or body.get("source") != V2:
        return "legacy_or_unqualified_receipt"
    d, e = body["donation"], body["evidence"]
    if not _object(d, {"version", "kind", "copper", "recipient", "collectorGuid", "reference"}, {"version", "kind", "copper", "recipient", "collectorGuid", "reference"}) or not _object(e, {"kind", "confirmedLocal", "automaticCredit", "mac"}, {"kind", "confirmedLocal", "automaticCredit", "mac"}):
        return "receipt_shape_held"
    if type(body["id"]) is not str or re.fullmatch(r"[0-9a-f]{24}", body["id"]) is None or type(d["version"]) is not int or d["version"] != 2:
        return "receipt_shape_held"
    if body["requestedBy"] != COLLECTOR or d["recipient"] != COLLECTOR or officer is not None and officer != COLLECTOR:
        return "receipt_collector_held"
    if not _name(body["character"]) or not _guid(body["guid"], True) or not _guid(d["collectorGuid"]) or not _name(body["guild"]) or not _name(body["realm"]):
        return "receipt_identity_held"
    if not _text(body["clientVersion"], 32) or re.fullmatch(r"[A-Za-z0-9._+\-]+", body["clientVersion"]) is None or not _integer(d["copper"], 1, MAX_COPPER):
        return "receipt_value_held"
    if type(d["reference"]) is not str or re.fullmatch(r"TITHE-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}", d["reference"]) is None:
        return "receipt_reference_held"
    expected = {"trade": "trade_complete_and_money_delta", "mail": "take_money_inbox_depletion_and_money_delta"}.get(d["kind"]) if type(d["kind"]) is str else None
    if expected is None or e["kind"] != expected or e["confirmedLocal"] is not True or e["automaticCredit"] is not False:
        return "receipt_evidence_held"
    at = int(time.time()) if at is None else at
    if not _integer(body["requestedAt"]) or not at - RETENTION_SECONDS < body["requestedAt"] <= at + 5:
        return "receipt_original_clock_held"
    if type(secret) is not str or not secret or type(e["mac"]) is not str or _HEX32.fullmatch(e["mac"]) is None or not hmac.compare_digest(e["mac"], tithe_mac(secret, body)):
        return "receipt_authentication_held"
    return None


def _membership(value):
    fields = {"version", "member", "observedAt", "scopeHash", "mac"}
    return (_object(value, fields, fields) and type(value["version"]) is int and value["version"] == 1
            and type(value["member"]) is bool and _integer(value["observedAt"])
            and type(value["scopeHash"]) is str and re.fullmatch(r"[0-9a-f]{16}", value["scopeHash"]) is not None
            and type(value["mac"]) is str and _HEX32.fullmatch(value["mac"]) is not None)


def _mail(value):
    fields = {"version", "sender", "code", "observedAt", "guild", "realm", "collectorGuid", "fingerprint", "mac"}
    return (_object(value, fields, fields) and type(value["version"]) is int and value["version"] == 242
            and _name(value["sender"], 128) and _text(value["code"], 7, 6) and _integer(value["observedAt"])
            and _name(value["guild"], 128) and _name(value["realm"], 128) and _guid(value["collectorGuid"])
            and type(value["fingerprint"]) is str and re.fullmatch(r"[0-9a-f]{64}", value["fingerprint"]) is not None
            and type(value["mac"]) is str and _HEX32.fullmatch(value["mac"]) is not None)


def _discord(value):
    fields = {"version", "userID", "lastOnlineName", "lastOnlineGUID", "fromDiscord", "observedAt", "collectorGuid", "guild", "realm", "mac"}
    return (_object(value, fields, fields) and type(value["version"]) is int and value["version"] == 242
            and type(value["userID"]) is str and re.fullmatch(r"[0-9]{17,20}", value["userID"]) is not None
            and _name(value["lastOnlineName"], 128) and _guid(value["lastOnlineGUID"]) and value["fromDiscord"] is True
            and _integer(value["observedAt"]) and _guid(value["collectorGuid"]) and _name(value["guild"], 128) and _name(value["realm"], 128)
            and type(value["mac"]) is str and _HEX32.fullmatch(value["mac"]) is not None)


def policy_error(body, secret, officer=None, at=None):
    """Static reasons only. A policy refusal makes no original-effect claim."""
    if type(body) is not dict:
        return "intake_shape_held"
    kind = body.get("type")
    if kind == "donation":
        return financial_error(body, secret, officer, at)
    if kind not in ("verify", "role", "guild") or not _object(body, _VERIFY if kind == "verify" else _ROLE, {"id", "type", "source", "character"}):
        return "intake_shape_held"
    if type(body["id"]) is not str or re.fullmatch(r"[A-Za-z0-9:._\-]{1,128}", body["id"]) is None or not _name(body["character"], 128) or type(body["source"]) is not str or re.fullmatch(r"[A-Za-z0-9:._\-]{1,64}", body["source"]) is None:
        return "intake_identity_held"
    for key in ("requestedBy", "guild", "realm", "rankName", "name", "bridgeSender"):
        if key in body and not _name(body[key], 128):
            return "intake_shape_held"
    for key in ("requestedAt", "observedAt"):
        if key in body and not _integer(body[key]):
            return "intake_shape_held"
    if "clientVersion" in body and not _text(body["clientVersion"], 32) or "guid" in body and not _guid(body["guid"], True) or "rankIndex" in body and not _integer(body["rankIndex"], 0, 9):
        return "intake_shape_held"
    for key in ("locallyValid", "bridgeUntrusted"):
        if key in body and type(body[key]) is not bool:
            return "intake_shape_held"
    if "observationId" in body and (type(body["observationId"]) is not str or _HEX32.fullmatch(body["observationId"]) is None) or "guidSource" in body and body["guidSource"] not in ("native-whisper-event", "unavailable", "UnitGUID-player"):
        return "intake_shape_held"
    if kind == "verify" and (type(body.get("code")) is not str or re.fullmatch(r"[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6,7}", body["code"]) is None):
        return "intake_code_held"
    for key, validate in (("nativeMembership", _membership), ("mailProof242", _mail), ("nativeDiscord", _discord)):
        if key in body and not validate(body[key]):
            return "intake_proof_shape_held"
    return None

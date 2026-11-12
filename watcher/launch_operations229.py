"""Dated, read-only launch queue projection. Never writes legacy invite custody."""
from __future__ import annotations

import hashlib
import hmac
import json
import math
import re
import time
import urllib.parse
from typing import Any, Callable

PATH = "/queue/launch-operations?keyVersion=officer-operations-v233"
PROTOCOL = "officer-operations-v233"
MAX_BYTES = 262144
MAX_PAGES = 50
MAX_REFRESH_ATTEMPTS = 50
MAX_RATE_RETRIES = 2
SOURCE_CHANGED_ERRORS = frozenset({'launch_cursor_source_changed', 'launch_cursor_role_source_changed'})
SELECTED_PROTOCOL = "promotion-selection-v274"
SELECTED_LEGACY_PROTOCOL = "promotion-selection-v273"
SELECTED_BATCH_PROTOCOL = "promotion-selection-v276"
_SELECTED_CONTROL_KEYS = {"version", "action", "id", "observedAt", "scopeHash", "guid", "targetGuid", "mac"}
_SELECTED_BATCH_CONTROL_KEYS = (_SELECTED_CONTROL_KEYS - {'targetGuid'}) | {'targetGuids'}
_SELECTED_KEYS = {"version", "protocol", "controlId", "actorGuid", "targetGuid", "scopeHash", "observedAt", "snapshotId", "snapshotAt", "startedAt", "expiresAt", "running", "stoppedReason", "attempts", "completed", "page", "coveredGuids"}
_SELECTED_BATCH_KEYS = (_SELECTED_KEYS - {'targetGuid'}) | {'targetGuids', 'targetsDigest', 'coverageKind'}
_GUID = re.compile(r"Player-[0-9]{1,6}-[0-9A-Fa-f]{4,16}")
_KEYS = {"protocol", "fetchedAt", "expiresAt", "status", "snapshotId", "snapshotAt", "memberCount", "guild", "canonicalGuild", "realm", "scopeHash", "entitlements", "nextCursor", "pageCursor", "scan", "invites", "promotions", "riskBuffer", "held", "heldReasons", "motd", "actions"}


def canonical_guild(value: Any) -> str | None:
    if not isinstance(value, str) or len(value) > 96 or re.search(r"[\x00-\x1f\x7f]", value):
        return None
    name = value.strip().lower()
    if name in {"olympus prime", "olympus", "olympus i"}:
        return "OLYMPUS PRIME"
    for numeral in ("II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"):
        if name == "olympus " + numeral.lower():
            return "Olympus " + numeral
    return None


def _integer(value: Any, low: int = 0, high: int = 2147483647) -> bool:
    return type(value) is int and low <= value <= high


def _text(value: Any, limit: int = 128, multiline: bool = False) -> bool:
    forbidden = r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\ud800-\udfff]" if multiline else r"[\x00-\x1f\x7f\ud800-\udfff]"
    return isinstance(value, str) and len(value.encode("utf-8", errors="surrogatepass")) <= limit and not re.search(forbidden, value)


def _person(row: Any) -> bool:
    return isinstance(row, dict) and _text(row.get("name"), 100) and bool(row["name"]) and "|" not in row["name"] and isinstance(row.get("guid"), str) and _GUID.fullmatch(row["guid"]) is not None


def validate_page(report: Any, at: int, allow_stale: bool = False) -> bool:
    return _validate_page(report, at, allow_stale, 60)


def _validate_page(report: Any, at: int, allow_stale: bool, report_ttl: int) -> bool:
    if not isinstance(report, dict) or set(report) != _KEYS or report["protocol"] != PROTOCOL or not isinstance(report["status"], str) or report["status"] not in {"ready", "partial", "held"}:
        return False
    fetched, expires = report["fetchedAt"], report["expiresAt"]
    if not _integer(fetched, 1) or not _integer(expires, 1) or not fetched < expires <= fetched + report_ttl or not fetched <= at + 5 or not allow_stale and at >= expires:
        return False
    scan = report["scan"]
    if not isinstance(scan, dict) or set(scan) != {"id", "startedAt", "expiresAt"}:
        return False
    identity = (report["snapshotId"], report["snapshotAt"], report["memberCount"], report["guild"], report["realm"], report["scopeHash"])
    if all(value is None for value in identity):
        if report["status"] != "held" or report["canonicalGuild"] is not None:
            return False
        if any(value is not None for value in scan.values()) or report["pageCursor"] is not None or report["nextCursor"] is not None:
            return False
    else:
        sid, snapshot, count, guild, realm, scope = identity
        if (not _integer(sid, 1) or not _integer(snapshot, 1) or not 0 <= fetched - snapshot < 600 or not _integer(count, 1, 1000)
                or not _text(guild) or not guild or guild != guild.strip() or canonical_guild(guild) != "OLYMPUS PRIME"
                or report["canonicalGuild"] != "OLYMPUS PRIME" or not _text(realm) or not realm or realm != realm.strip()
                or scope != hashlib.sha256(f"native-scope|1|{guild}|{realm}".encode()).hexdigest()[:16]):
            return False
        if (not isinstance(scan["id"], str) or not re.fullmatch(r"[0-9a-f]{32}", scan["id"])
                or not _integer(scan["startedAt"], 1) or not _integer(scan["expiresAt"], 1)
                or not scan["startedAt"] <= fetched < scan["expiresAt"] <= min(scan["startedAt"] + 600, snapshot + 600)
                or not _text(report["pageCursor"], 4096) or not report["pageCursor"] or not report["pageCursor"].isascii()):
            return False
    entitlement = report["entitlements"]
    if (not isinstance(entitlement, dict) or set(entitlement) != {"offset", "pageSize", "scanned", "total", "unscanned", "retryAfterSeconds"}
            or entitlement["pageSize"] != 20 or any(not _integer(entitlement[key], 0, 1000) for key in ("offset", "scanned", "total", "unscanned"))
            or entitlement["offset"] > entitlement["total"] or entitlement["scanned"] > entitlement["total"] or entitlement["unscanned"] > entitlement["total"]
            or entitlement["retryAfterSeconds"] is not None and not _integer(entitlement["retryAfterSeconds"], 1, 86400)):
        return False
    cursor = report["nextCursor"]
    if cursor is not None and (not _text(cursor, 4096) or not cursor or not cursor.isascii()):
        return False
    if report["status"] == "ready" and (cursor is not None or entitlement["unscanned"] != 0):
        return False
    if report["actions"] != {"automatic": False, "roleGrants": False, "removals": False, "requiresNativeRecheck": True} or any(type(v) is not bool for v in report["actions"].values()):
        return False
    if not isinstance(report["invites"], list) or len(report["invites"]) > 3 or entitlement["offset"] != 0 and report["invites"]:
        return False
    for key in ("promotions", "riskBuffer", "held", "heldReasons"):
        if not isinstance(report[key], list) or len(report[key]) > 1000:
            return False
    guids: set[str] = set()
    queue_ids, proof_ids = set(), set()
    for row in report["invites"]:
        if (not _person(row) or set(row) != {"queueId", "proofId", "name", "guid", "fullName", "scopeHash", "observedAt", "expiresAt", "reason", "source"}
                or not _integer(row["queueId"], 1) or row["queueId"] in queue_ids
                or not isinstance(row["proofId"], str) or not re.fullmatch(r"[0-9a-f]{32}", row["proofId"]) or row["proofId"] in proof_ids
                or not _text(row["fullName"], 100) or not row["fullName"] or "|" in row["fullName"] or row["fullName"].strip().lower() != row["name"].strip().lower()
                or row["scopeHash"] != report["scopeHash"] or not _integer(row["observedAt"], 1) or row["observedAt"] > fetched + 5
                or not _integer(row["expiresAt"], 1) or not row["observedAt"] < row["expiresAt"] <= row["observedAt"] + 60
                or row["reason"] != "knight-unguilded" or row["source"] != "native-who-unit-v233" or row["guid"] in guids
                or not allow_stale and at >= row["expiresAt"]):
            return False
        guids.add(row["guid"]); queue_ids.add(row["queueId"]); proof_ids.add(row["proofId"])
    for row in report["promotions"]:
        if (not _person(row) or set(row) != {"guid", "name", "currentSlot", "targetSlot", "targetName", "reason"}
                or not _integer(row["currentSlot"], 7, 9) or row["targetSlot"] not in (6, 8) or type(row["targetSlot"]) is not int
                or row["targetSlot"] >= row["currentSlot"]
                or (row["targetSlot"], row["targetName"], row["reason"]) not in ((6, "Veteran", "knight-veteran"), (8, "Member", "verified-initiate"))
                or row["targetSlot"] == 8 and row["currentSlot"] != 9
                or row["guid"] in guids):
            return False
        guids.add(row["guid"])
    for row in report["riskBuffer"]:
        if (not _person(row) or set(row) != {"guid", "name", "currentSlot", "level", "lastOnlineDays", "reason", "reviewOnly"}
                or type(row["currentSlot"]) is not int or row["currentSlot"] != 9 or row["reason"] != "unverified-initiate" or row["reviewOnly"] is not True
                or row["level"] is not None and not _integer(row["level"], 1, 255)
                or row["lastOnlineDays"] is not None and (type(row["lastOnlineDays"]) not in (int, float) or not math.isfinite(row["lastOnlineDays"]) or not 0 < row["lastOnlineDays"] <= 36500)
                or row["guid"] in guids):
            return False
        guids.add(row["guid"])
    for row in report["held"]:
        if not _person(row) or set(row) != {"guid", "name", "reason"} or not _text(row["reason"], 128) or not row["reason"] or row["guid"] in guids:
            return False
        guids.add(row["guid"])
    if any(not _text(reason, 128) or not reason for reason in report["heldReasons"]):
        return False
    motd = report["motd"]
    if (not isinstance(motd, dict) or set(motd) != {"short", "bulletin", "characters", "bytes", "maxBytes"}
            or not _text(motd["short"], 128) or not motd["short"] or "|" in motd["short"] or not _text(motd["bulletin"], 8192, True)
            or type(motd["maxBytes"]) is not int or motd["maxBytes"] != 128 or type(motd["bytes"]) is not int or motd["bytes"] != len(motd["short"].encode())
            or type(motd["characters"]) is not int or motd["characters"] != len(motd["short"].encode("utf-16-le")) // 2):
        return False
    return not (report["status"] == "held" and (report["invites"] or report["promotions"] or report["riskBuffer"]))


def _same_scan(page: dict[str, Any], first: dict[str, Any]) -> bool:
    return (all(page[key] == first[key] for key in ("snapshotId", "snapshotAt", "memberCount", "guild", "canonicalGuild", "realm", "scopeHash", "scan"))
            and page["entitlements"]["total"] == first["entitlements"]["total"])


def control_mac(secret: str, value: dict[str, Any]) -> str:
    message = '|'.join(['launch-control', '1', value['action'], value['id'], str(value['observedAt']), value['scopeHash'], value['guid'], str(value['offset'])])
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()[:32]


def complete_roster_digest(roster: Any) -> str | None:
    """All native fields except the export timestamp; no normalization or restart inference."""
    if (not isinstance(roster, dict) or not _integer(roster.get('exportedAt'), 1)
            or not _integer(roster.get('total'), 1, 1000) or not isinstance(roster.get('members'), list)
            or len(roster['members']) != roster['total'] or canonical_guild(roster.get('nativeGuild')) != 'OLYMPUS PRIME'
            or not _text(roster.get('nativeRealm')) or not roster['nativeRealm']):
        return None
    guids, names = set(), set()
    for row in roster['members']:
        if (not _person(row) or row['guid'] in guids or row['name'].lower() in names
                or not _integer(row.get('rankIndex'), 0, 9) or not _text(row.get('rank')) or not row['rank']
                or not _integer(row.get('level'), 1, 255)):
            return None
        guids.add(row['guid']); names.add(row['name'].lower())
    try:
        raw = json.dumps({key: value for key, value in roster.items() if key != 'exportedAt'}, sort_keys=True, ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError):
        return None
    return hashlib.sha256(raw.encode()).hexdigest()


def validate_control(secret: str, value: Any, at: int, guid: Any, guild: Any, realm: Any) -> bool:
    if not isinstance(value, dict) or set(value) != {'version', 'action', 'id', 'observedAt', 'scopeHash', 'guid', 'offset', 'mac'}:
        return False
    if (type(value['version']) is not int or value['version'] != 1 or value['action'] not in ('scan', 'stop', 'recheck')
            or not isinstance(value['id'], str) or not re.fullmatch(r'[0-9]{9,11}:[0-9]{1,10}', value['id'])
            or not _integer(value['observedAt'], 1) or not at - 60 <= value['observedAt'] <= at + 5
            or value['guid'] != guid or not isinstance(guid, str) or _GUID.fullmatch(guid) is None
            or not _text(guild) or guild != guild.strip() or canonical_guild(guild) != 'OLYMPUS PRIME' or not _text(realm) or not realm
            or value['scopeHash'] != hashlib.sha256(f'native-scope|1|{guild}|{realm}'.encode()).hexdigest()[:16]
            or not _integer(value['offset'], 0, 980) or value['offset'] % 20 or value['action'] != 'recheck' and value['offset'] != 0
            or not isinstance(value['mac'], str) or not re.fullmatch(r'[0-9a-f]{32}', value['mac'])):
        return False
    return hmac.compare_digest(value['mac'], control_mac(secret, value))


class Scan:
    """Explicit local control; at most one request per five-second step, never an automatic restart."""
    def __init__(self, clock: Callable[[], float] = time.time):
        self.clock = clock
        self.pages: dict[int, dict[str, Any]] = {}
        self.control_id = ''
        self.scope_hash = ''
        self.phase = 'idle'
        self.cursor: str | None = None
        self.refresh: list[int] = []
        self.calls = 0
        self.refreshed = 0  # Shared auxiliary attempts: discovery retries and explicit rechecks/retries.
        self.next_at = 0.0
        self.complete = False
        self.stopped: str | None = None
        self.last_start = -math.inf
        self.expected_snapshot: tuple[int, int] | None = None
        self.rate_retry: tuple[int, str] | None = None
        self.rate_retries: dict[int, int] = {}

    def request(self, value: dict[str, Any], at: float) -> bool:
        action = value['action']
        if action == 'scan':
            if self.phase != 'idle' or at < self.last_start + 60:
                return False
            self.pages = {}; self.scope_hash = value['scopeHash']; self.calls = 0; self.refreshed = 0
            self.expected_snapshot = None
            self.rate_retry = None; self.rate_retries = {}
            self.cursor = None; self.complete = False; self.phase = 'discover'; self.last_start = at
        elif action == 'stop':
            self._stop('operator-stopped'); self.control_id = value['id']; return True
        else:
            page = self.pages.get(value['offset'])
            if (self.phase != 'idle' or self.stopped is not None or self.refreshed >= MAX_REFRESH_ATTEMPTS
                    or not page or page['scan']['expiresAt'] <= at or page['scopeHash'] != value['scopeHash']):
                return False
            self.phase = 'refresh'; self.refresh = [value['offset']]
        self.control_id = value['id']; self.stopped = None; self.next_at = max(self.next_at, at)
        return True

    def _stop(self, reason: str) -> None:
        self.phase = 'idle'; self.stopped = reason; self.rate_retry = None

    def expire(self, at: float) -> bool:
        if self.phase != 'idle' and self.pages and at >= self.pages[min(self.pages)]['scan']['expiresAt']:
            self._stop('scan-expired'); return True
        return False

    def defer_rate_limit(self, delay: Any) -> bool:
        """Honor a known transport pause without issuing or charging another GET."""
        if self.phase == 'idle':
            return False
        before = (self.phase, self.stopped)
        if not self.pages or not _integer(delay, 1, 86400):
            self._stop('source-refused')
        else:
            self.next_at = max(self.next_at, self.clock() + max(5, delay))
            if self.next_at >= self.pages[min(self.pages)]['scan']['expiresAt']:
                self._stop('rate-limit-exceeds-scan')
            else:
                self.stopped = 'rate-limited-wait'
        return before != (self.phase, self.stopped)

    def _rate_wait(self, offset: int, cursor: str | None, delay: Any) -> None:
        # Only an already captured signed cursor can preserve the original scan.
        # A cursorless first-request refusal must never bootstrap a new scan.
        if not self.pages or not _text(cursor, 4096) or not cursor or not cursor.isascii() or not _integer(delay, 1, 86400):
            self._stop('source-refused'); return
        if self.rate_retries.get(offset, 0) >= MAX_RATE_RETRIES:
            self._stop('rate-limit-retries-exhausted'); return
        if self.refreshed >= MAX_REFRESH_ATTEMPTS:
            self._stop('refresh-budget-exhausted'); return
        self.defer_rate_limit(delay)
        if self.phase != 'idle':
            self.rate_retry = (offset, cursor)

    def step(self, call: Callable[..., tuple[bool, Any]], at: float) -> bool:
        if self.phase == 'idle':
            return False
        if self.expire(at):
            return True
        if at < self.next_at:
            return False
        auxiliary = self.phase == 'refresh' or self.rate_retry is not None
        if auxiliary and self.refreshed >= MAX_REFRESH_ATTEMPTS:
            self._stop('refresh-budget-exhausted'); return True
        if self.phase == 'discover' and not auxiliary and self.calls - self.refreshed >= MAX_PAGES:
            self._stop('discovery-budget-exhausted'); return True
        if self.phase == 'refresh':
            if not self.refresh and self.rate_retry is None:
                self.phase = 'idle'; return True
        if self.rate_retry is not None:
            offset, cursor = self.rate_retry
            self.rate_retries[offset] = self.rate_retries.get(offset, 0) + 1
        elif self.phase == 'refresh':
            offset = self.refresh.pop(0)
            cursor = self.pages[offset]['pageCursor']
        else:
            offset = len(self.pages) * 20
            cursor = self.cursor
        path = PATH + ('&cursor=' + urllib.parse.quote(cursor, safe='') if cursor else '')
        # Spend each attempt, including refusal/unknown, before transport. The first
        # request for each discovery offset spends one of 50 discovery attempts;
        # every retry and explicit recheck shares the other 50 (at most 100 total).
        # Controls do not reset counters or five-second cross-request spacing.
        self.calls += 1
        if auxiliary:
            self.refreshed += 1
        try:
            okay, page = call('GET', path, retries=1)
        except Exception:
            self.next_at = self.clock() + 5
            self._stop('source-unknown'); return True
        self.next_at = self.clock() + 5
        if not okay:
            if isinstance(page, dict) and type(page.get('httpStatus')) is int and page['httpStatus'] == 429:
                self._rate_wait(offset, cursor, page.get('retryAfterSeconds')); return True
            if (isinstance(page, dict) and type(page.get('httpStatus')) is int and page['httpStatus'] == 409
                    and isinstance(page.get('error'), str) and page['error'] in SOURCE_CHANGED_ERRORS):
                self._stop('snapshot-changed'); return True
            self._stop('source-refused'); return True
        if not validate_page(page, int(self.clock())) or page['scopeHash'] != self.scope_hash:
            self._stop('invalid-page'); return True
        if page['status'] == 'held':
            self._stop('source-held'); return True
        if self.expected_snapshot is not None and (page['snapshotId'],page['snapshotAt']) != self.expected_snapshot:
            self._stop('snapshot-changed'); return True
        if page['entitlements']['offset'] != offset or self.pages and not _same_scan(page, self.pages[min(self.pages)]):
            self._stop('snapshot-changed'); return True
        others = {row['guid'] for key, prior in self.pages.items() if key != offset for kind in ('invites', 'promotions', 'riskBuffer', 'held') for row in prior[kind]}
        if any(row['guid'] in others for kind in ('invites', 'promotions', 'riskBuffer', 'held') for row in page[kind]):
            self._stop('duplicate-identity'); return True
        self.pages[offset] = page
        if page['entitlements']['retryAfterSeconds'] is not None:
            self._rate_wait(offset, page['pageCursor'], page['entitlements']['retryAfterSeconds']); return True
        self.rate_retry = None; self.stopped = None
        if self.phase == 'discover':
            self.cursor = page['nextCursor']
            if self.cursor is None:
                self.complete = True
                self.phase = 'idle'  # only a new explicit chosen-page control can refresh
        else:
            if not self.refresh:
                self.phase = 'idle'
        return True

    def result(self) -> dict[str, Any]:
        return {'version': 2, 'controlId': self.control_id, 'scanComplete': self.complete, 'running': self.phase != 'idle',
                'stoppedReason': self.stopped, 'discoveredPages': len(self.pages), 'refreshedPages': self.refreshed,
                'pages': [self.pages[key] for key in sorted(self.pages)]}


def _lua(value: Any) -> str:
    if value is None:
        return "nil"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if type(value) in (int, float):
        return str(value)
    if isinstance(value, list):
        return "{" + ",".join(_lua(item) for item in value) + "}"
    return "{" + ",".join(key + "=" + _lua(item) for key, item in value.items()) + "}"


def render_pages(result: Any, at: int) -> str | None:
    if not isinstance(result, dict) or set(result) != {'version', 'controlId', 'scanComplete', 'running', 'stoppedReason', 'discoveredPages', 'refreshedPages', 'pages'} or result['version'] != 2:
        return None
    pages = result['pages']
    if (not isinstance(pages, list) or len(pages) > MAX_PAGES or not _text(result['controlId'], 32)
            or type(result['scanComplete']) is not bool or type(result['running']) is not bool
            or result['stoppedReason'] is not None and not _text(result['stoppedReason'], 64)
            or not _integer(result['discoveredPages'], 0, 50) or result['discoveredPages'] != len(pages)
            or not _integer(result['refreshedPages'], 0, MAX_REFRESH_ATTEMPTS) or any(not validate_page(page, at, allow_stale=True) for page in pages)):
        return None
    if pages and any(not _same_scan(page, pages[0]) or page['entitlements']['offset'] != index*20 for index, page in enumerate(pages)):
        return None
    people = [row['guid'] for page in pages for kind in ('invites', 'promotions', 'riskBuffer', 'held') for row in page[kind]]
    if len(set(people)) != len(people):
        return None
    # Opaque pagination material never needs to reach the game or its logs.
    safe_pages = [{key: value for key, value in page.items() if key not in {'nextCursor', 'pageCursor'}} for page in pages]
    safe = {**result, 'pages': safe_pages}
    return "-- Dated launch projection only; old pages are advisory, never action-fresh.\nOlympusLaunchQueue=" + _lua(safe) + "\n"


def _selected_targets276(value: Any) -> bool:
    return (isinstance(value, list) and 1 <= len(value) <= 20
            and all(isinstance(guid, str) and _GUID.fullmatch(guid) for guid in value)
            and all(value[i-1] < value[i] for i in range(1, len(value))))


def targets_digest276(value: list[str]) -> str:
    return hashlib.sha256(json.dumps(value, separators=(',', ':')).encode()).hexdigest()


def selected_control_mac(secret: str, value: dict[str, Any]) -> str:
    batch = value.get('version') == 3
    message = '|'.join(['launch-selected-read', '3' if batch else '2', 'select-many' if batch else 'select', value['id'], str(value['observedAt']),
                         value['scopeHash'], value['guid'], ','.join(value['targetGuids']) if batch else value['targetGuid']])
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()[:32]


def validate_selected_control(secret: str, value: Any, at: int, guid: Any, guild: Any, realm: Any) -> bool:
    if not isinstance(value, dict):
        return False
    batch = value.get('version') == 3
    if set(value) != (_SELECTED_BATCH_CONTROL_KEYS if batch else _SELECTED_CONTROL_KEYS):
        return False
    if (type(value['version']) is not int or value['version'] != (3 if batch else 2) or value['action'] != ('select-many' if batch else 'select')
            or not isinstance(value['id'], str) or not re.fullmatch(r'[0-9]{9,11}:[0-9]{1,10}', value['id'])
            or not _integer(value['observedAt'], 1) or value['id'].split(':')[0] != str(value['observedAt'])
            or not at-60 <= value['observedAt'] <= at+5 or value['guid'] != guid
            or not isinstance(guid, str) or _GUID.fullmatch(guid) is None
            or (not _selected_targets276(value['targetGuids']) if batch else not isinstance(value['targetGuid'], str) or _GUID.fullmatch(value['targetGuid']) is None)
            or not _text(guild) or guild != guild.strip() or canonical_guild(guild) != 'OLYMPUS PRIME'
            or not _text(realm) or not realm
            or value['scopeHash'] != hashlib.sha256(f'native-scope|1|{guild}|{realm}'.encode()).hexdigest()[:16]
            or not isinstance(value['mac'], str) or re.fullmatch(r'[0-9a-f]{32}', value['mac']) is None):
        return False
    return hmac.compare_digest(value['mac'], selected_control_mac(secret, value))


def _selected_page(page: Any, record: dict[str, Any], covered: Any, at: int, allow_stale: bool = False) -> bool:
    # Only the recognized promotion-only envelope can opt into its longer
    # observation window. The public discovery validator stays fixed at60s.
    protocol = record.get('protocol')
    batch = protocol == SELECTED_BATCH_PROTOCOL
    if (protocol not in (SELECTED_PROTOCOL, SELECTED_LEGACY_PROTOCOL, SELECTED_BATCH_PROTOCOL) or not isinstance(page, dict)
            or page.get('nextCursor') is not None or page.get('invites') != [] or page.get('riskBuffer') != []
            or page.get('status') == 'held'):
        return False
    if batch and (record.get('coverageKind') != 'selected-guids' or not _selected_targets276(record.get('targetGuids'))
                  or record.get('targetsDigest') != targets_digest276(record['targetGuids']) or covered != record['targetGuids']):
        return False
    report_ttl = 60 if protocol == SELECTED_LEGACY_PROTOCOL else 600
    if (not _validate_page(page, at, allow_stale, report_ttl)
            or page['snapshotId'] != record['snapshotId'] or page['snapshotAt'] != record['snapshotAt']
            or page['scopeHash'] != record['scopeHash'] or page['scan']['startedAt'] != record['startedAt']
            or page['scan']['expiresAt'] != record['expiresAt'] or page['expiresAt'] > record['expiresAt']
            or not isinstance(covered, list) or not 1 <= len(covered) <= 20
            or any(not isinstance(guid, str) or _GUID.fullmatch(guid) is None for guid in covered)
            or len(set(covered)) != len(covered) or not batch and record['targetGuid'] not in covered
            or len(covered) != page['entitlements']['scanned']):
        return False
    e = page['entitlements']
    if (e['offset'] % 20 or (e['offset'] != 0 or e['scanned'] != len(record['targetGuids']) if batch else e['scanned'] != min(20, e['total']-e['offset']))
            or e['total'] != page['memberCount'] or e['unscanned'] != max(0, e['total']-e['offset']-e['scanned'])):
        return False
    return all(row['guid'] in covered for key in ('promotions', 'held') for row in page[key])


class SelectedRead:
    """One explicit new-source read. Never resets or resumes the discovery Scan."""
    def __init__(self, clock: Callable[[], float] = time.time):
        self.clock = clock
        self.record: dict[str, Any] | None = None
        self.cursor: str | None = None
        self.next_at = 0.0
        self.native_digest: str | None = None
        self.native_guids: set[str] = set()

    @property
    def running(self) -> bool:
        return self.record is not None and self.record['running']

    def request(self, control: dict[str, Any], accepted: Any, roster: Any, at: float) -> None:
        batch = control.get('version') == 3
        self.record = dict(version=1, protocol=SELECTED_PROTOCOL, controlId=control['id'], actorGuid=control['guid'],
                           scopeHash=control['scopeHash'], observedAt=control['observedAt'],
                           snapshotId=None, snapshotAt=None, startedAt=control['observedAt'], expiresAt=None,
                           running=False, stoppedReason='native-roster-receipt-required', attempts=0, completed=False,
                           page=None, coveredGuids=[])
        if batch:
            targets = list(control['targetGuids'])
            self.record.update(protocol=SELECTED_BATCH_PROTOCOL, targetGuids=targets,
                               targetsDigest=targets_digest276(targets), coverageKind='selected-guids')
        else:
            self.record['targetGuid'] = control['targetGuid']
        self.cursor = None
        self.native_digest = None
        self.native_guids = set()
        digest = complete_roster_digest(roster)
        if (not isinstance(accepted, dict) or digest is None or accepted.get('digest') != digest
                or accepted.get('exportedAt') != roster['exportedAt'] or not _integer(accepted.get('snapshot'), 1)
                or not 0 <= at-roster['exportedAt'] < 600):
            return
        r = self.record
        r.update(snapshotId=accepted['snapshot'], snapshotAt=accepted['exportedAt'],
                 expiresAt=min(control['observedAt']+600, accepted['exportedAt']+600))
        self.native_guids = {row['guid'] for row in roster['members']}
        self.native_digest = digest
        targets = control['targetGuids'] if batch else [control['targetGuid']]
        if any(guid not in self.native_guids for guid in targets):
            r['stoppedReason'] = 'selected-target-unavailable'
            return
        if at >= r['expiresAt']:
            r['stoppedReason'] = 'scan-expired'
            return
        r.update(running=True, stoppedReason=None)
        self.next_at = max(self.next_at, at)

    def hold(self, reason: str) -> bool:
        if not self.running:
            return False
        self.record.update(running=False, completed=False, stoppedReason=reason, page=None, coveredGuids=[])
        return True

    def expire(self, at: float) -> bool:
        return self.hold('scan-expired') if self.running and at >= self.record['expiresAt'] else False

    def expire_admission(self, at: float) -> bool:
        if self.expire(at):
            return True
        if self.running and not self.cursor and at >= self.record['observedAt']+60:
            return self.hold('selection-admission-expired')
        return False

    def source_changed(self, roster: Any) -> bool:
        if not self.running:
            return False  # A completed observation keeps its protocol-bound original source and dates.
        if (complete_roster_digest(roster) != self.native_digest
                or roster.get('exportedAt') != self.record['snapshotAt']):
            return self.hold('native-roster-changed-or-expired')
        return False

    def defer_rate_limit(self, delay: Any) -> bool:
        if not self.running:
            return False
        if not _integer(delay, 1, 86400):
            return self.hold('source-refused')
        self.next_at = max(self.next_at, self.clock()+max(5, delay))
        limit = self.record['expiresAt'] if self.cursor else min(self.record['expiresAt'], self.record['observedAt']+60)
        if self.next_at >= limit:
            return self.hold('rate-limit-exceeds-scan')
        self.record['stoppedReason'] = 'rate-limited-wait'
        return True

    def step(self, call: Callable[..., tuple[bool, Any]], at: float, source_current: Callable[[], bool] | None = None) -> bool:
        if not self.running:
            return False
        if self.expire_admission(at):
            return True
        r = self.record
        if at < self.next_at:
            return False
        if r['attempts'] >= 3:
            return self.hold('rate-limit-retries-exhausted')
        batch = r['protocol'] == SELECTED_BATCH_PROTOCOL
        query = dict(selectionId=r['controlId'], snapshotId=r['snapshotId'], snapshotAt=r['snapshotAt'])
        query.update(targetGuids=json.dumps(r['targetGuids'], separators=(',', ':'))) if batch else query.update(targetGuid=r['targetGuid'])
        if self.cursor:
            query['cursor'] = self.cursor
        r['attempts'] += 1  # Spend before transport; no unknown outcome is automatically retried.
        try:
            okay, reply = call('GET', PATH+'&'+urllib.parse.urlencode(query), retries=1)
        except Exception:
            self.next_at = self.clock()+5
            return self.hold('source-unknown')
        self.next_at = self.clock()+5
        if self.expire(self.clock()):
            return True
        if not okay:
            if isinstance(reply, dict) and type(reply.get('httpStatus')) is int and reply['httpStatus'] == 429:
                if r['attempts'] >= 3:
                    return self.hold('rate-limit-retries-exhausted')
                return self.defer_rate_limit(reply.get('retryAfterSeconds'))
            return self.hold('source-refused')
        keys = {'version', 'protocol', 'controlId', 'coveredGuids', 'page'} | ({'coverageKind', 'targetGuids', 'targetsDigest'} if batch else {'targetGuid'})
        if (not isinstance(reply, dict) or set(reply) != keys
                or type(reply['version']) is not int or reply['version'] != 1
                or (reply['protocol'] != SELECTED_BATCH_PROTOCOL if batch else reply['protocol'] not in (SELECTED_PROTOCOL, SELECTED_LEGACY_PROTOCOL))
                or reply['controlId'] != r['controlId']
                or (reply['targetGuids'] != r['targetGuids'] or reply['targetsDigest'] != r['targetsDigest'] or reply['coverageKind'] != 'selected-guids' if batch else reply['targetGuid'] != r['targetGuid'])):
            return self.hold('invalid-selected-page')
        page, covered = reply['page'], reply['coveredGuids']
        if isinstance(page, dict) and validate_page(page, int(self.clock())) and page['status'] == 'held' and covered == []:
            reasons = set(page['heldReasons'])
            return self.hold('selected-target-unavailable' if 'selected-target-unavailable' in reasons else 'source-held')
        observation = {**r, 'protocol': reply['protocol']}
        if (not _selected_page(page, observation, covered, int(self.clock())) or not set(covered) <= self.native_guids
                or r['page'] is not None and page['scan']['id'] != r['page']['scan']['id']):
            return self.hold('invalid-selected-page')
        r['page'] = json.loads(json.dumps(page))
        r['coveredGuids'] = list(covered)
        r['protocol'] = reply['protocol']
        self.cursor = page['pageCursor']
        if page['entitlements']['retryAfterSeconds'] is not None:
            if r['attempts'] >= 3:
                return self.hold('rate-limit-retries-exhausted')
            return self.defer_rate_limit(page['entitlements']['retryAfterSeconds'])
        if source_current is not None:
            try:
                if not source_current():
                    return self.hold('native-roster-changed-or-expired')
            except Exception:
                return self.hold('source-unknown')
        r.update(running=False, completed=True, stoppedReason=None)
        return True


def render_selected(record: Any, at: int) -> str | None:
    if not isinstance(record, dict):
        return None
    batch = record.get('protocol') == SELECTED_BATCH_PROTOCOL
    if (set(record) != (_SELECTED_BATCH_KEYS if batch else _SELECTED_KEYS) or type(record['version']) is not int or record['version'] != 1
            or record['protocol'] not in (SELECTED_PROTOCOL, SELECTED_LEGACY_PROTOCOL, SELECTED_BATCH_PROTOCOL) or not _text(record['controlId'], 32)
            or not re.fullmatch(r'[0-9]{9,11}:[0-9]{1,10}', record['controlId'])
            or not _integer(record['observedAt'], 1) or record['controlId'].split(':')[0] != str(record['observedAt'])
            or record['startedAt'] != record['observedAt'] or not _integer(record['attempts'], 0, 3)
            or any(type(record[key]) is not bool for key in ('running', 'completed'))
            or not isinstance(record['coveredGuids'], list)
            or any(not isinstance(record[key], str) or _GUID.fullmatch(record[key]) is None for key in (('actorGuid',) if batch else ('actorGuid', 'targetGuid')))
            or batch and (record['coverageKind'] != 'selected-guids' or not _selected_targets276(record['targetGuids']) or record['targetsDigest'] != targets_digest276(record['targetGuids']))
            or not isinstance(record['scopeHash'], str) or not re.fullmatch(r'[0-9a-f]{16}', record['scopeHash'])
            or record['stoppedReason'] is not None and (not _text(record['stoppedReason'], 64) or not record['stoppedReason'])):
        return None
    if record['running'] and record['completed'] or not record['running'] and not record['completed'] and not record['stoppedReason']:
        return None
    known = record['snapshotId'] is not None or record['snapshotAt'] is not None or record['expiresAt'] is not None
    if known:
        if (not _integer(record['snapshotId'], 1) or not _integer(record['snapshotAt'], 1)
                or record['expiresAt'] != min(record['observedAt']+600, record['snapshotAt']+600)):
            return None
    elif (record['running'] or record['completed'] or record['attempts'] or record['page'] is not None
          or record['coveredGuids'] or not record['stoppedReason']):
        return None
    if record['completed'] and (record['running'] or record['stoppedReason'] is not None or record['page'] is None):
        return None
    if record['page'] is not None and not _selected_page(record['page'], record, record['coveredGuids'], at, allow_stale=True):
        return None
    if record['page'] is None and record['coveredGuids']:
        return None
    safe = {**record, 'page': None if record['page'] is None else
            {key: value for key, value in record['page'].items() if key not in {'pageCursor', 'nextCursor'}}}
    return "-- Independent dated promotion observation; never renews discovery or native authority.\nOlympusLaunchSelected=" + _lua(safe) + "\n"

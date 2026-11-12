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
    if not isinstance(report, dict) or set(report) != _KEYS or report["protocol"] != PROTOCOL or not isinstance(report["status"], str) or report["status"] not in {"ready", "partial", "held"}:
        return False
    fetched, expires = report["fetchedAt"], report["expiresAt"]
    if not _integer(fetched, 1) or not _integer(expires, 1) or not fetched < expires <= fetched + 60 or not fetched <= at + 5 or not allow_stale and at >= expires:
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

#!/usr/bin/env python3
"""olympus-verify watcher — runs on the officer's PC next to the WoW client. Standard library only.

What it does, forever, politely:
  1. tails Logs/WoWChatLog.txt and forwards valid `!verify CODE` whispers to the Worker (the client writes in
     48 KiB batches and at /reload or logout; the measured lag describes when lines reached this watcher,
     not an addon flush or its cause — see --check)
  2. re-reads the addon's SavedVariables after every /reload or logout: mail codes, invite/joined/note events, the roster export
  3. pulls the invite queue into OlympusQueue.lua in legacy mode, or a separate roster display file in membership-only mode
     (the addon reads it at the next login or /reload and fires the invites on the officer's key press)
  4. tells the Worker, on that same poll, whether this officer's game client is in the world, so /verify names an
     officer who can actually receive the whisper

It never touches the game client, never sends input, never keeps the client awake. It reads files WoW writes and
writes one data file WoW reads at load time — the same contract every addon-companion app uses.

    python watcher.py --config config.json --membership-only            run the strict launch collector
    python watcher.py --config config.json --membership-only --check    check the strict Worker profile and paths, then exit
"""
from __future__ import annotations

import argparse
import errno
import hashlib
import hmac
import http.client
import json
import math
import os
import random
import re
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from enum import Enum
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import codes  # noqa: E402
import intake242
import savedvars  # noqa: E402
from custody_recovery import StateLease  # noqa: E402
from treasury_receipts227 import TreasuryJournal, normalize_name as treasury_name, parse_note as treasury_note  # noqa: E402
from native_membership227 import parse_membership_note, validate_membership  # noqa: E402
import launch_operations229  # noqa: E402
import officer_invites233  # noqa: E402

# The sender is a character name, never a channel tag or a UI escape. Since patch 12.1 code shipped to this client,
# Blizzard's Discord bridge can relay a Discord user's text into guild chat, and a Discord display name is free text:
# "Tater Toe whispers" as a display name would otherwise log as "[Guild] Tater Toe whispers: ..." and read as a
# whisper. The HMAC already makes that harmless (a code is keyed to the exact character name), but the pattern
# should not accept it in the first place. Real whisper senders were measured as bare names.
WHISPER_RE = re.compile(r"^\d{1,2}/\d{1,2}\s+\d{1,2}:\d{2}:\d{2}(?:\.\d{3})?\s+(?P<sender>(?![\[|])[^:\[\]|]+?) whispers:\s*(?P<text>.*)$")
# 6 symbols: a code bound to a character; 7: a request code whose character is the sender (codes.py). The token is the
# whole run of letters and digits after "!verify", checked by codes.strict_code exactly as the addon checks it.
VERIFY_RE = re.compile(r"^\s*!verify\s+(?P<code>[A-Za-z0-9]+)", re.IGNORECASE | re.ASCII)  # ASCII only, like the addon's Lua patterns
# Guild system lines (English client): "X has joined the guild." / "X has left the guild." / "X has been kicked out of the guild by Y."
SYSTEM_RE = re.compile(r"^(?P<stamp>\d{1,2}/\d{1,2}\s+\d{1,2}:\d{2}:\d{2}(?:\.\d{3})?)\s+(?P<text>.*)$")
GUILD_JOIN_RE = re.compile(r"^(?P<name>[^:]{2,40}?) has joined the guild\.$")
GUILD_LEAVE_RE = re.compile(r"^(?P<name>[^:]{2,40}?) has left the guild\.$")
GUILD_KICK_RE = re.compile(r"^(?P<name>[^:]{2,40}?) has been kicked out of the guild by (?P<by>.+?)\.$")
# The officer's OWN outgoing whisper, which only their client can write, carrying an HMAC the addon computed.
# This is what makes a join trustworthy: "X has joined the guild." is reproducible by any player with /emote.
OUT_WHISPER_RE = re.compile(r"^\d{1,2}/\d{1,2}\s+\d{1,2}:\d{2}:\d{2}(?:\.\d{3})?\s+To (?P<name>[^:]+?):\s*(?P<text>.*)$")
JOIN_TOKEN_RE = re.compile(r"\(ref OLVj-(?P<mac>[0-9a-f]{10})\)")
# The addon's note to itself for a new member who never whispered the officer (26 Sep: the addon whispers nobody who
# has not whispered first): "To <officer>: Olympus: <Name> joined the guild (ref OLVj-...)". The MAC is over <Name>,
# so the member named in the text, not the recipient, is who joined.
JOIN_SELF_RE = re.compile(r"^Olympus: (?P<joined>[^()]{2,40}?) joined the guild \(ref OLVj-[0-9a-f]{10}\)\s*$")
# The addon's signed note for a departure (27 Sep): "To <officer>: Olympus: <Name> left the guild (ref OLVl-...)".
# The kind is in the text and inside the MAC, so a removal to free a seat keeps its reason end to end.
LEAVE_TOKEN_RE = re.compile(r"\(ref OLVl-(?P<mac>[0-9a-f]{10})\)")
LEAVE_SELF_RE = re.compile(
    r"^Olympus: (?P<name>[^()]{2,40}?) (?P<what>left the guild|was removed from the guild|was removed to free a seat|was removed as unverified) "
    r"\(ref OLVl-[0-9a-f]{10}\)\s*$"
)
LEAVE_KIND = {"left the guild": "left", "was removed from the guild": "kicked", "was removed to free a seat": "space", "was removed as unverified": "unverified"}
# The addon's note at every login and reload (27 Sep): which character the officer is playing and which addon build is
# loaded, signed like the notes above. /verify then names the character actually online, and the Worker hands out
# request codes only once an addon that understands them has checked in.
RELAY_SELF_RE = re.compile(
    r"^Olympus: relay (?P<name>[^()]{2,40}?) is in the world \(addon (?P<ver>[0-9][0-9A-Za-z.+-]{0,15}), ref OLVr-(?P<mac>[0-9a-f]{10})\)\s*$"
)
# The addon writes its login note at every login and /reload; one older than this no longer vouches for the addon build.
RELAY_NOTE_VALID = 14 * 86400
# The character behind a confirmed code (27 Sep): "To <officer>: Olympus: <Name> is <GUID> (ref OLVg-...)", written by
# the addon right after it confirms a whispered code. The verification it belongs to is relayed with that GUID, so the
# link is pinned to the character that whispered rather than to whatever character has the name at the next export.
GUID_SELF_RE = re.compile(r"^Olympus: (?P<name>[^()]{2,40}?) is (?P<guid>Player-\d{1,6}-[0-9A-Fa-f]{4,16}) \(ref OLVg-(?P<mac>[0-9a-f]{10})\)\s*$")
# How long a GUID read from a note stays attached to its character's next verification.
IDENTITY_TTL = 600
# SavedVariables join/leave/removal events older than this are not relayed: the roster export has settled them by then,
# and relaying them late is how an old departure could undo a newer re-invite (review, 27 Sep).
SV_EVENT_MAX_AGE = 6 * 3600
# Timing markers written on purpose: /olv logtest (a whisper to self) and /olv diag clog (C_Log, other Logs files).
DIAG_RE = re.compile(r"OLVDIAG (?P<tag>[a-z0-9_-]{1,24}) (?P<epoch>\d{9,11})")
# "9/27 08:00:00.123  ..." -- local time, no year, as the client writes every chat-log line.
LINE_TS_RE = re.compile(r"^(?P<mo>\d{1,2})/(?P<d>\d{1,2})\s+(?P<h>\d{1,2}):(?P<mi>\d{2}):(?P<s>\d{2})(?:\.(?P<ms>\d{1,3}))?\s")
# Logs/Client.log: the client's own record of entering and leaving the world (measured 26 Sep on 1.60.1.70009).
CLIENT_IN = "Active Player Created"
CLIENT_OUT = ("Client Object Manager Destroyed", "Client Destroy")

WATCHER_VERSION = "0.6.28"
STRICT_DISPLAY_PROTOCOL = "launch-roster-display-v2"
STRICT_DISPLAY_PATH = "/queue/unverified?keyVersion=" + STRICT_DISPLAY_PROTOCOL
STRICT_DISPLAY_MAX_BYTES = 512 * 1024


def verification_roster_source(roster: Any) -> dict[str, Any] | None:
    """Complete native enumeration, without requiring unrelated offline GUID/level data.

    The original Worker ACK remains mandatory. Only the CURRENT target's unique
    GUID is useful to verification; launch scan eligibility remains unchanged.
    """
    if (not isinstance(roster, dict) or type(roster.get('exportedAt')) is not int or roster['exportedAt'] < 1
            or type(roster.get('total')) is not int or not 1 <= roster['total'] <= 1000
            or not isinstance(roster.get('members'), list) or len(roster['members']) != roster['total']
            or launch_operations229.canonical_guild(roster.get('nativeGuild')) != 'OLYMPUS PRIME'):
        return None
    for key in ('nativeGuild', 'nativeRealm'):
        value = roster.get(key)
        if not isinstance(value, str) or not value or len(value.encode('utf-8')) > 128 or any(ord(c) < 32 or ord(c) == 127 for c in value):
            return None
    members, guids = {}, {}
    for row in roster['members']:
        if not isinstance(row, dict) or not isinstance(row.get('name'), str):
            return None
        name = row['name']
        key = codes.normalize_character(name)
        if not key or key in members or len(name) > 96 or any(ord(c) < 32 or c in '|[]()' for c in name):
            return None
        guid = row.get('guid') if codes.is_guid(row.get('guid')) else None
        members[key] = guid
        if guid is not None:
            guids[guid] = guids.get(guid, 0) + 1
    try:
        raw = json.dumps({k: v for k, v in roster.items() if k != 'exportedAt'}, sort_keys=True, ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError, OverflowError):
        return None
    return {'digest': hashlib.sha256(raw.encode()).hexdigest(), 'members': members, 'guidCounts': guids,
            'scopeHash': hashlib.sha256(('native-scope|1|' + roster['nativeGuild'] + '|' + roster['nativeRealm']).encode()).hexdigest()[:16]}


# Where a relay character may come from: a login note addressed to the name it carries (a whisper the server delivered),
# or the roster entry with the GUID the addon saved. A name from anywhere else -- 0.6.1 saved UnitName's first part, and
# watcher 0.6.1 kept it -- is not named to applicants.
RELAY_TRUSTED = ("note", "roster")


def saved_character(db: dict[str, Any]) -> str | None:
    """The playing character as the guild roster in the same SavedVariables file names it, found by the GUID the addon
    saved (0.6.2 on). None without one: a saved name alone is not trusted, because 0.6.1 saved UnitName's first part."""
    guid = db.get("lastCharacterGuid")
    roster = db.get("roster")
    members = roster.get("members") if isinstance(roster, dict) else None
    if not codes.is_guid(guid) or not isinstance(members, list):
        return None
    for m in members:
        if isinstance(m, dict) and m.get("guid") == guid and isinstance(m.get("name"), str) and 1 < len(m["name"].strip()) <= 40:
            return m["name"].strip()
    return None


def line_epoch(line: str, now: float | None = None) -> float | None:
    """Wall-clock time of a chat-log line (the client writes local time without a year)."""
    m = LINE_TS_RE.match(line)
    if not m:
        return None
    now = now if now is not None else time.time()
    year = datetime.fromtimestamp(now).year
    try:
        t = datetime(year, int(m["mo"]), int(m["d"]), int(m["h"]), int(m["mi"]), int(m["s"]), int((m["ms"] or "0").ljust(3, "0")) * 1000).timestamp()
    except ValueError:
        return None
    if t - now > 86400:  # a December line read in January
        t = datetime(year - 1, int(m["mo"]), int(m["d"]), int(m["h"]), int(m["mi"]), int(m["s"])).timestamp()
    return t


def log(msg: str) -> None:
    line = f"{datetime.now().strftime('%H:%M:%S')} {msg}"
    try:
        print(line, flush=True)
    except UnicodeEncodeError:
        # 0.6.9: a redirected Windows console is cp1252. A character name it cannot encode must not raise here,
        # or the chat lane re-reads the same line forever and every later lane in the loop is skipped.
        encoding = getattr(sys.stdout, "encoding", None) or "ascii"
        print(line.encode(encoding, "backslashreplace").decode(encoding), flush=True)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Never follow a redirect: it would carry the bearer token to another host, or turn a signed POST into a GET.
    A redirect from the Worker's origin is a configuration error (the wrong worker_url) and is reported as one (0.6.5)."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


def _seconds(cfg: dict[str, Any], key: str, default: float) -> float:
    """A configured interval: a positive, finite number of seconds, or a config error naming the setting."""
    try:
        value = float(cfg.get(key, default))
    except (TypeError, ValueError):
        raise ValueError(f"{key} must be a number of seconds") from None
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f"{key} must be a positive number of seconds")
    return value


class Worker:
    """The HTTP side. 0.6.5 (1 Oct 2026; the transport hardening ported from Olympus Forever's watcher, consolidation
    A14 / plan P-25): worker_url must be a bare HTTPS origin (no credentials, path, query or fragment); redirects are
    refused; a 401, 403 or 429 pauses every request (15 minutes, or the Worker's Retry-After, or 60 s for a rate limit)
    and the pause is kept in the state file so a restart does not hammer a revoked token; a redirect pauses the same
    way, as a configuration error; a response that is not UTF-8 JSON is not a success; and no response body ever
    reaches the log, since an error body could echo what was sent."""

    PAUSE_AUTH = 900
    PAUSE_RATE = 60
    PAUSE_REDIRECT = 900
    # 0.6.6: the only words of a successful answer that reach the log (Codex's review of 0.6.5, 1 Oct 03:07 UTC: no
    # arbitrary response fields). Anything else is summarized as "delivered".
    KNOWN_RESULTS = frozenset({"verified", "resumed", "no_pending", "bound_elsewhere", "member", "banned", "invalid", "source_expired"})  # exactly ingest.ts's words

    def __init__(self, base: str, token: str):
        try:
            url = urllib.parse.urlsplit(base)
            valid = (isinstance(base, str) and not any(ord(c) <= 32 or ord(c) == 127 for c in base)
                     and url.scheme == "https" and bool(url.hostname) and url.username is None and url.password is None
                     and not url.query and not url.fragment and url.path in ("", "/"))
            url.port  # noqa: B018  a malformed port raises here, without echoing the configured URL
        except (TypeError, ValueError, AttributeError):
            valid = False
        if not valid:
            raise ValueError("worker_url must be an HTTPS origin without credentials, path, query or fragment")
        self.base = base.rstrip("/")
        # 0.6.9: a token with spaces or line breaks (a stray newline when pasting) made http.client's error text print it.
        if not isinstance(token, str) or not token or any(ord(c) <= 32 or ord(c) == 127 for c in token):
            raise ValueError("watcher_token is empty or contains spaces or line breaks; paste the Worker secret WATCHER_TOKEN again")
        self.token = token
        self._wake_binding264 = hashlib.sha256(json.dumps([self.base, self.token]).encode("utf-8")).hexdigest()
        self.opener = urllib.request.build_opener(NoRedirect())
        self.pause_state: State | None = None  # set by Watcher, so the pause lives in the state file
        self._pause: dict[str, Any] = {"worker_retry_at": 0, "worker_retry_status": None}

    def _pause_data(self) -> dict[str, Any]:
        return self.pause_state.d if self.pause_state is not None else self._pause

    def _save_pause(self) -> None:
        if self.pause_state is not None:
            self.pause_state.save()

    @staticmethod
    def _retry_after(headers: Any) -> int:
        """Retry-After in whole seconds: a finite number (long ones included), or an HTTP date (a past one is 0);
        anything else, a non-finite number included, is invalid and counts as absent (0.6.6; Codex 03:07)."""
        try:
            value = headers.get("Retry-After", "0") if headers is not None else "0"
            try:
                seconds = float(value)
            except ValueError:
                seconds = parsedate_to_datetime(value).timestamp() - time.time()
            if not math.isfinite(seconds):
                return 0
            return math.ceil(max(0, seconds))
        except (ValueError, TypeError, OverflowError, AttributeError):
            return 0

    @staticmethod
    def summarize(res: Any) -> str:
        """What a successful answer may say in the log: a known result word, or a count, never a field of its own."""
        if isinstance(res, dict):
            r = res.get("result")
            if isinstance(r, str) and r in Worker.KNOWN_RESULTS:
                detail = ""
                if r == "member" and isinstance(res.get("roleOutcome"), str) and res["roleOutcome"] in {"granted", "observed-present", "unknown", "not-attempted", "held"}:
                    detail = "; role=" + res["roleOutcome"]
                    for key in ("roleGranted", "pendingConsumed"):
                        if type(res.get(key)) is bool:
                            detail += "; " + key + "=" + str(res[key]).lower()
                return f" ({r}{detail})"
            if isinstance(res.get("marked"), int):
                return f" (marked {res['marked']})"
        return ""

    def paused(self) -> dict[str, Any] | None:
        """The pause in force as the failure value call() returns, or None when requests may go out."""
        pause = self._pause_data()
        until = float(pause.get("worker_retry_at") or 0)
        if until <= time.time():
            return None
        return {"httpStatus": pause.get("worker_retry_status"), "retryAfterSeconds": math.ceil(until - time.time()), "paused": True}

    def _pause_for(self, status: int, seconds: float, why: str) -> None:
        pause = self._pause_data()
        changed = pause.get("worker_retry_status") != status
        pause["worker_retry_at"] = max(float(pause.get("worker_retry_at") or 0), math.ceil(time.time() + seconds))
        pause["worker_retry_status"] = status
        self._save_pause()
        if changed:  # said once per cause, not on every poll
            log(why)

    def call(self, method: str, path: str, body: Any = None, retries: int = 3) -> Any:
        self.last_refusal = None  # internal evidence; the original (True, None) transport contract stays intact
        paused = self.paused()
        if paused:
            return False, paused
        # 0.6.6: the bearer goes to the configured origin only: the path must be local and absolute (Codex 03:07; a path
        # without its leading slash would have changed the hostname by concatenation)
        if not isinstance(path, str) or not path.startswith("/") or path.startswith("//") or "://" in path or any(ord(c) <= 32 or ord(c) == 127 for c in path):
            log(f"worker {method}: refused a request path that is not local to the origin")
            return False, "invalid_path"
        log_path = path.split("?", 1)[0]  # Opaque launch cursors must never enter logs.
        data = None if body is None else json.dumps(body).encode("utf-8")
        wire_path = path
        if getattr(self, 'membership_only', False) and ((method == 'GET' and path.split('?', 1)[0] == '/queue') or (method == 'POST' and path in ('/ingest/verify', '/ingest/roster', '/ingest/events', '/ingest/intake242'))):
            # A pre-launch Worker refuses keyVersion before touching the queue
            # or ingestion. This also fences a binary rollback after startup's
            # health check; an ignored proof can never become a legacy grant.
            wire_path += ('&' if '?' in wire_path else '?') + 'keyVersion=launch-membership-v1'
        req = urllib.request.Request(self.base + wire_path, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self.token}")
        req.add_header("Content-Type", "application/json")
        req.add_header("User-Agent", f"olympus-verify-watcher/{WATCHER_VERSION}")
        delay = 2
        for attempt in range(retries):
            try:
                with self.opener.open(req, timeout=20) as res:
                    try:
                        limit = STRICT_DISPLAY_MAX_BYTES if path == STRICT_DISPLAY_PATH else launch_operations229.MAX_BYTES if log_path == "/queue/launch-operations" else None
                        payload = res.read(limit + 1) if limit is not None else res.read()
                        if limit is not None and len(payload) > limit:
                            return False, "invalid_response"
                        raw = payload.decode("utf-8")
                        result = json.loads(raw) if raw.strip() else None
                    except (UnicodeDecodeError, ValueError, RecursionError):
                        log(f"worker {method} {log_path} -> a response that is not JSON; not treated as delivered")
                        return False, "invalid_response"
                    if not isinstance(result, dict):
                        # 0.6.6: the Worker acknowledges with a JSON object; an empty or other 2xx is not a delivery
                        # (Codex 03:07: an empty 2xx was True/None and post() dropped the event as delivered)
                        log(f"worker {method} {log_path} -> {getattr(res, 'status', '2xx')} without a JSON acknowledgment; not treated as delivered")
                        return False, "invalid_response"
                    pause = self._pause_data()
                    if pause.get("worker_retry_status") is not None:
                        pause["worker_retry_status"] = None
                        self._save_pause()
                    return True, result
            except urllib.error.HTTPError as e:
                code = e.code
                if 300 <= code < 400:
                    self._pause_for(code, self.PAUSE_REDIRECT, f"worker {method} {log_path} -> {code} redirect refused; worker_url must be the Worker's own HTTPS origin; all requests paused for 15 minutes")
                    return False, {"httpStatus": code, "retryAfterSeconds": self.PAUSE_REDIRECT, "configurationError": True}
                if code in (401, 403, 429):
                    seconds = max(self.PAUSE_AUTH if code in (401, 403) else self.PAUSE_RATE, self._retry_after(e.headers)) + random.uniform(0, 1)
                    self._pause_for(code, seconds, f"worker {method} {log_path} -> {code} " + ("(check watcher_token); all requests paused for at least 15 minutes" if code in (401, 403) else "rate limited; all requests paused until the Worker's deadline"))
                    return False, {"httpStatus": code, "retryAfterSeconds": math.ceil(float(self._pause_data()["worker_retry_at"]) - time.time())}
                if code == 409 and method == "POST" and path == "/ingest/verify":
                    # .227: a known closed-request refusal is not an unknown
                    # provider effect. Settle this original so it cannot block all
                    # other applicants, but keep its code deduplicated. A fresh
                    # code/actual whisper is needed after roster reconciliation.
                    try:
                        raw = e.read(4097)
                        refused = json.loads(raw) if len(raw) <= 4096 else None
                        if isinstance(refused, dict) and set(refused) == {"result", "error", "roleGranted", "inviteQueued", "pendingConsumed", "requestRefused"} and refused.get("result") == "membership_not_confirmed" and all(refused.get(key) is False for key in ("roleGranted", "inviteQueued")) and refused.get("pendingConsumed") is True and refused.get("requestRefused") is True:
                            log("worker verify -> membership not confirmed; request closed without a role or invite")
                            return True, {"result": "membership_not_confirmed", "roleGranted": False, "inviteQueued": False, "pendingConsumed": True, "requestRefused": True}
                    except (ValueError, OSError, http.client.HTTPException):
                        pass  # Any other/unknown refusal retains the original.
                if 400 <= code < 500:
                    # the Worker understood and rejected it; retrying will not change the answer. Its body is not logged.
                    log(f"worker {method} {log_path} -> {code}")
                    self.last_refusal = code
                    return True, None
                log(f"worker {method} {log_path} -> {code}, retry {attempt + 1}/{retries}")
            except (urllib.error.URLError, TimeoutError, OSError, http.client.HTTPException) as e:
                # the exception's class only: its text can carry response bytes (0.6.6, Codex 03:07)
                log(f"worker {method} {log_path} unreachable ({type(e).__name__}), retry {attempt + 1}/{retries}")
            time.sleep(delay)
            delay *= 2
        return False, "unreachable"

    def _wake_pause264(self, status: int, headers: Any) -> None:
        if 300 <= status < 400:
            self._pause_for(status, self.PAUSE_REDIRECT, "worker optional sweep redirect refused; all requests paused")
        elif status in (401, 403, 429):
            seconds = max(self.PAUSE_AUTH if status in (401, 403) else self.PAUSE_RATE, self._retry_after(headers)) + random.uniform(0, 1)
            self._pause_for(status, seconds, f"worker optional sweep -> {status}; all requests paused")

    def wake_sweep264(self, secret: str) -> bool:
        """One fresh scheduling hint, never a customer original, role receipt or retry."""
        if (getattr(self, 'membership_only', False) is not True or self.paused()
                or not isinstance(secret, str) or not secret
                or hashlib.sha256(json.dumps([self.base, self.token]).encode("utf-8")).hexdigest() != self._wake_binding264):
            return False
        at = int(time.time())
        if at <= 0:
            return False
        body = json.dumps({"kind": "sweep", "at": at, "nonce": str(uuid.uuid4()), "independent": True}, separators=(",", ":"), allow_nan=False).encode("utf-8")
        signature = hmac.new(secret.encode("utf-8"), b"role-continuation242\n" + body, hashlib.sha256).hexdigest()
        url = self.base + "/internal/roles242/continue"
        req = urllib.request.Request(url, data=body, method="POST")
        req.add_header("Authorization", f"Bearer {self.token}")
        req.add_header("Content-Type", "application/json")
        req.add_header("User-Agent", f"olympus-verify-watcher/{WATCHER_VERSION}")
        req.add_header("X-Olympus-Role-Continuation", signature)
        try:
            with self.opener.open(req, timeout=20) as response:
                status = response.status
                headers = response.headers
                # No redirects, unbounded reads or JSON/customer ACK adoption.
                acknowledged = status == 202 and response.geturl() == url and response.read(1) == b""
        except urllib.error.HTTPError as error:
            try:
                self._wake_pause264(error.code, error.headers)
            finally:
                error.close()
        except (urllib.error.URLError, TimeoutError, OSError, http.client.HTTPException):
            pass  # An unknown scheduling outcome is never resent with this nonce.
        else:
            if status != 202:
                self._wake_pause264(status, headers)
            return acknowledged
        return False


class NoCustody(RuntimeError):
    """Stop consuming the source: no retained original owns this work yet."""


class LaunchNotReady(RuntimeError):
    """No ingestion into an older/unqualified Worker that ignores native proof."""


class CustodyStopped(RuntimeError):
    """Reload durable state in a new process; never discard an uncertain save."""


class VerificationDeferred(RuntimeError):
    """Original source remains on disk; no verification claim or request was made."""


class Delivery(str, Enum):
    DELIVERED = "delivered"
    EXPIRED_LOCAL = "expired-unattempted-source"
    HELD = "durable-held"
    NO_CUSTODY = "no-custody"

    def __bool__(self) -> bool:
        # Existing callers/tests that only ask whether delivery completed retain that meaning.
        return self is Delivery.DELIVERED


def atomic_local_text(path: Path, payload: str) -> None:
    """Retry only frozen local bytes when a short sharing/access failure interrupts replacement.

    No renderer, state serializer or provider operation runs inside this retry. An
    exhausted state save still reaches the caller's original custody-stop path.
    """
    tmp = path.with_suffix(".tmp")
    for attempt in range(3):
        try:
            with tmp.open("w", encoding="utf-8") as stream:
                stream.write(payload)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(tmp, path)
            return
        except OSError as error:
            transient = (isinstance(error, PermissionError)
                         or error.errno in (errno.EACCES, errno.EBUSY, errno.EPERM)
                         or getattr(error, "winerror", None) in (5, 32, 33))
            if not transient or attempt == 2:
                raise
            time.sleep(0.05 * (attempt + 1))


class State:
    def __init__(self, path: Path):
        self.path = path
        self.d: dict[str, Any] = {
            "chat_offset": 0,
            "chat_size": 0,
            "chat_init": False,   # separate from the offset: "chat_size == 0 and off == 0" also matches an emptied log
            "chat_fp": "",        # fingerprint of the log's first bytes, so a recreated file is not seeked into
            "sv_mtime": 0,
            "roster_sent": 0,
            "seen": [],
            "outbox": [],         # posts that have not been acknowledged yet; nothing is dropped on an outage
            "queue_hash": "",
            "queue_written_pending": [],
            "queue_written_original": None,  # exact new acknowledgment; old bare pending IDs remain held
            "lag": [],            # [kind, seconds from the line's own timestamp to this watcher reading it, when] — last 60
            "diag": [],           # OLVDIAG markers: which file each reached, and how long after it was written
            "relay": {},          # from the addon's signed login note: {"character", "addon", "at"}
            "tickets": {},        # request code digest -> [first sender, when]: a request code links one character only
            "identities": {},     # normalized name -> [GUID, when], from the addon's signed notes (IDENTITY_TTL)
            "worker_retry_at": 0,         # 0.6.5: a 401/403/429 or redirect pause (Worker.call) survives a restart
            "worker_retry_status": None,
        }
        if path.exists():
            try:
                loaded = json.loads(path.read_text(encoding="utf-8"))
                if not isinstance(loaded, dict) or not isinstance(loaded.get("outbox", []), list) or not isinstance(loaded.get("seen", []), list):
                    raise ValueError("invalid custody state")
                self.d.update(loaded)
            except Exception as error:
                # Starting empty would silently destroy the only copy of an unknown original.
                raise ValueError("watcher state unreadable; original file retained, delivery must stay stopped") from error

    def save(self) -> None:
        # Freeze before the first attempt, including any exact retained provider original.
        atomic_local_text(self.path, json.dumps(self.d))

    @staticmethod
    def _k(key: str) -> str:
        # Dedupe keys are built from verification codes, so store only a digest: the state file sits next to
        # config.json and should not be a list of usable codes.
        return hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]

    def seen(self, key: str) -> bool:
        h = self._k(key)
        if h in self.d["seen"] or key in self.d["seen"]:  # legacy cleartext keys still count
            return True
        self.d["seen"].append(h)
        self.d["seen"] = self.d["seen"][-8000:]
        return False

    def was_seen(self, key: str) -> bool:
        """Read only; a source claim is committed with its original's custody save."""
        return self._k(key) in self.d["seen"] or key in self.d["seen"]

    def unsee(self, key: str) -> None:
        """Undo a seen() claim so the work is retried later (used when a post could not even be buffered)."""
        h = self._k(key)
        self.d["seen"] = [x for x in self.d["seen"] if x != h and x != key]


class Watcher:
    def __init__(self, cfg: dict[str, Any]):
        self.cfg = cfg
        wow = Path(cfg["wow_dir"])
        self.chat_log = wow / "Logs" / "WoWChatLog.txt"
        self.sv_file = wow / "WTF" / "Account" / cfg["account"] / "SavedVariables" / "OlympusVerify.lua"
        self.queue_file = wow / "Interface" / "AddOns" / "OlympusVerify" / "OlympusQueue.lua"
        self.strict_display_file = self.queue_file.with_name("OlympusVerifyLists.lua")
        self.launch_operations_file = self.queue_file.with_name("OlympusLaunchQueue.lua")
        self.worker = Worker(cfg["worker_url"], cfg["watcher_token"])
        self.secret = cfg["verify_secret"]
        self.officer = cfg.get("officer_character", "")
        self.membership_only = cfg.get("membership_only", False)
        if type(self.membership_only) is not bool:
            raise ValueError("membership_only must be a boolean")
        self.worker.membership_only = self.membership_only
        self._native_membership: dict[str, dict[str, Any]] = {}
        # Identity used to claim invites, so two officers running the addon do not both invite the same applicant.
        # Defaults to the officer character, normalized, which is unique per officer and needs no extra configuration.
        self.officer_id = str(cfg.get("officer_id") or codes.normalize_character(self.officer) or "").strip()[:64]
        self.state = State(Path(cfg.get("state_file", "watcher-state.json")))
        # Local unclassified receipts are independent of network/role dispatch and
        # commit before the chat/SavedVariables cursor. The owner named this exact
        # collector (3 Nov 2026); neither branch names nor a Discord ID are inferred.
        self.treasury = TreasuryJournal(self.state.path.with_name(self.state.path.stem + ".treasury-receipts227.json"), str(cfg.get("treasury_recipient", "Fern Melder")), cfg.get("treasury_retention_days", 30))
        self._treasury_purged_at = 0.0
        self.worker.pause_state = self.state  # 0.6.5: the transport pause is kept with the rest of the state
        # 0.6.9: floors, so a tiny interval cannot turn the loop into a request storm against the Worker (650 requests
        # in 8 s). 0.6.10: zero, negative and non-numbers are refused at startup instead of being floored without a word.
        self.poll = max(1.0, _seconds(cfg, "poll_seconds", 2))
        self.queue_poll = max(5.0, _seconds(cfg, "queue_poll_seconds", 30))
        self._last_queue_pull = 0.0
        self._last_role_wake264: float | None = None
        self._role_wake_startup264: str | None = None
        # Who is in the guild but not verified. Slow on purpose: the addon reads the queue file only at login or
        # /reload, so fetching this more often than a person reloads buys nothing and costs D1 reads (the free tier
        # ran out of writes once already, on 18 Sep). A roster upload forces the next fetch, since that is when it moves.
        self.unverified_poll = _seconds(cfg, "unverified_poll_seconds", 1800)
        self._last_unverified_pull = 0.0
        self._next_strict_display_pull = 0.0
        self.launch_scan = launch_operations229.Scan(lambda: time.time())
        self._launch_roster_candidate = None
        self._launch_accepted_roster = None  # same-process positive receipt only; never inferred after restart
        self._verification_roster = None
        self._verification_roster_candidate = None
        self._verification_roster_originals: dict[int, dict[str, Any]] = {}
        self._verification_originals: dict[int, dict[str, Any]] = {}
        self._verification_seen_claims: dict[str, dict[str, Any]] = {}
        # Current-process originals only. Persisted/reloaded queue rows never
        # acquire this independent scheduling or non-head ACK custody.
        self._independent_originals: dict[int, dict[str, Any]] = {}
        self._verification_waiting = None
        self._verification_sv_stamp = None
        self._unverified: dict[str, Any] | None = None
        self.max_outbox = int(cfg.get("max_outbox", 500))
        self._custody_halted = False
        self._ack_settlement_pending: tuple[str, dict[str, Any]] | None = None
        self._custody_warning = None
        # other client logs, scanned for OLVDIAG markers only (a C_Log test); what was there at start is not news
        self.logs_dir = wow / "Logs"
        self.wow_dir = wow
        self._log_sizes: dict[str, float] = self._snapshot_log_sizes()
        self._last_diag_scan = 0.0
        self._last_lag_report = time.time()
        # relay presence: whether this officer's client is in the world, reported on the /queue poll
        self.report_presence = bool(cfg.get("report_presence", True)) and bool(self.officer)
        self._presence: bool | None = None
        self._presence_at = 0.0
        # Joins and departures from SavedVariables got their own dedupe keys in 0.6.0 ("J:"/"L:"). Events written before
        # this watcher first ran keep the old keys ("j:"/"l:"), under which they were already relayed; without this an
        # upgrade would resend every one of them still in the addon's 500-event ring.
        if not self.state.d.get("trusted_keys_since"):
            self.state.d["trusted_keys_since"] = int(time.time())
            self.state.save()

    # ---------- delivery ----------
    def _warn_custody(self, reason: str) -> None:
        if self._custody_warning != reason:
            self._custody_warning = reason
            log("delivery held: " + reason)  # fixed text only: no payload, response or credential

    @staticmethod
    def _state_write_failed(phase: str, error: OSError) -> None:
        # AA-W61 (.197, 2026-10-24): retain useful OS failure classification,
        # never the exception message/path, which can contain private material.
        errno = error.errno if type(error.errno) is int else 0
        winerror = getattr(error, "winerror", None)
        winerror = winerror if type(winerror) is int else 0
        log(f"state write failed: {phase} {type(error).__name__} errno={errno} winerror={winerror}")

    def _require_custody_continuation(self) -> None:
        if self._custody_halted and self._ack_settlement_pending is None:
            # A failed replace may have committed. Exiting allows a fresh load
            # of either exact durable state; dropping the in-memory original
            # and retrying here could contradict an already committed claim.
            raise CustodyStopped("local custody persistence stopped; inspect storage and restart")

    def _delivery_binding(self) -> str:
        # Pin the original configured destination and officer/token context without persisting a credential.
        return hashlib.sha256(json.dumps([self.worker.base, self.officer_id, self.worker.token]).encode("utf-8")).hexdigest()

    @staticmethod
    def _original_digest(item: dict[str, Any]) -> str:
        return hashlib.sha256(json.dumps([item["path"], item["body"], item["at"], item["binding"]], allow_nan=False).encode("utf-8")).hexdigest()

    def _retained_original(self, item: Any) -> bool:
        try:
            return (isinstance(item, dict) and item.get("custody") == 1 and item.get("binding") == self._delivery_binding()
                    and type(item.get("at")) is int and item.get("digest") == self._original_digest(item))
        except (KeyError, TypeError, ValueError, OverflowError):
            return False

    def _freeze_original(self, path: str, body: Any, label: str) -> dict[str, Any]:
        frozen = json.loads(json.dumps(body, allow_nan=False))
        item = {"path": path, "body": frozen, "label": label, "at": int(time.time()), "binding": self._delivery_binding(), "custody": 1}
        item["digest"] = self._original_digest(item)
        if self.membership_only and path in ("/ingest/verify", officer_invites233.PATH):
            # Only this process's newly reserved original may make its first request.
            # Rehydrating an old/unknown JSON row never creates dispatch authority.
            self._verification_originals[id(item)] = {"original": item, "attempted": False,
                                                     "snapshot": json.dumps(item, sort_keys=True, allow_nan=False), "claims": ()}
        candidate = self._verification_roster_candidate
        if path == "/ingest/roster" and candidate is not None and frozen == candidate["body"]:
            self._verification_roster_originals[id(item)] = {**candidate, "original": item}
        return item

    def verification_roster_ready(self, body: Any) -> bool:
        if not self.membership_only:
            return True
        witness = self._verification_roster
        at = int(time.time())
        if not isinstance(body, dict) or witness is None:
            return False
        if witness["fileStamp"] is not None:
            try:
                current = self.sv_file.stat()
            except OSError:
                return False
            if (current.st_mtime_ns, current.st_size) != witness["fileStamp"]:
                return False
        proof = validate_membership(self.secret, body.get("character", ""), body.get("guid"),
                                    body.get("code", ""), body.get("nativeMembership"), at)
        if (proof is None or body.get("source") != "whisper" or proof["scopeHash"] != witness["scopeHash"]
                or not at - 600 < witness["exportedAt"] <= at
                or self.state.d["roster_sent"] != witness["exportedAt"]):
            return False
        if proof["member"] and (witness["members"].get(codes.normalize_character(body["character"])) != body["guid"]
                                or witness["guidCounts"].get(body["guid"]) != 1):
            return False
        return True

    def officer_invite_roster_ready(self, body: Any) -> bool:
        witness = self._verification_roster
        at = int(time.time())
        valid = officer_invites233.validate(self.secret, body, at)
        if not self.membership_only or valid is None or witness is None:
            return False
        if witness["fileStamp"] is not None:
            try:
                current = self.sv_file.stat()
            except OSError:
                return False
            if (current.st_mtime_ns, current.st_size) != witness["fileStamp"]:
                return False
        return (valid["nativeInvite"]["scopeHash"] == witness["scopeHash"]
                and at - 600 < witness["exportedAt"] <= at
                and self.state.d["roster_sent"] == witness["exportedAt"]
                and codes.normalize_character(valid["character"]) not in witness["members"]
                and witness["guidCounts"].get(valid["guid"], 0) == 0)

    def forward_officer_invite(self, body: Any) -> None:
        observed = body.get("nativeInvite", {}).get("observedAt") if isinstance(body, dict) and isinstance(body.get("nativeInvite"), dict) else None
        valid = officer_invites233.validate(self.secret, body, observed if type(observed) is int and observed < int(time.time()) else int(time.time()))
        if valid is None:
            return
        key = "officer-invite233:" + valid["nativeInvite"]["proofId"]
        if self.state.was_seen(key):
            return
        self._post_claimed(officer_invites233.PATH, valid, "attended officer invite proof", [key])

    def _wait_for_verification_roster(self) -> None:
        message = "verification waiting for a fresh trusted roster ACK; use Sync & reload, then inspect the watcher result"
        if self._verification_waiting != message:
            self._verification_waiting = message
            log(message)

    def note_verification_roster_receipt(self, item: dict[str, Any], receipt: dict[str, Any]) -> None:
        source = self._verification_roster_originals.pop(id(item), None)
        if (source is None or source["original"] is not item or item.get("body") != source["body"]
                or receipt.get("trusted") is not True or type(receipt.get("snapshot")) is not int or receipt["snapshot"] < 1
                or type(receipt.get("members")) is not int or receipt["members"] != len(source["body"]["members"])
                or "refused" in receipt or "skipped" in receipt):
            return
        self._verification_roster = {"digest": source["digest"], "exportedAt": source["exportedAt"],
                                     "scopeHash": source["scopeHash"], "members": source["members"], "guidCounts": source["guidCounts"],
                                     "snapshot": receipt["snapshot"], "fileStamp": source["fileStamp"]}
        self._verification_waiting = None
        log("verification roster ACK: complete native source accepted; pending fresh proofs may now be relayed")

    def _outbox_original_index(self, item: dict[str, Any]) -> int | None:
        matches = [i for i, original in enumerate(self.state.d["outbox"]) if original is item]
        return matches[0] if len(matches) == 1 else None

    def _independent_original_current(self, item: dict[str, Any], *, receipt: bool = False) -> bool:
        original = self._independent_originals.get(id(item))
        if original is None or original.get("original") is not item or not self._retained_original(item):
            return False
        expected = original.get("receipt") if receipt else original.get("snapshot")
        try:
            return isinstance(expected, str) and expected == json.dumps(item, sort_keys=True, allow_nan=False)
        except (TypeError, ValueError, OverflowError):
            return False

    def _independent_original_ready(self, item: dict[str, Any]) -> bool:
        if (not self.membership_only or self._outbox_original_index(item) is None
                or not self._independent_original_current(item)):
            return False
        original = self._independent_originals[id(item)]
        if original["attempted"] is not False or item.get("acknowledged") is True or item.get("refusal_status") is not None:
            return False
        if item.get("path") == "/ingest/roster":
            source = self._verification_roster_originals.get(id(item))
            return source is not None and source.get("original") is item and item.get("body") == source.get("body")
        if item.get("path") in ("/ingest/verify", officer_invites233.PATH):
            source = self._verification_originals.get(id(item))
            return (source is not None and source["attempted"] is False
                    and self._verification_original_current(item, source) and self._verification_claims_owned(item, source))
        return False

    def _settle_original(self, item: dict[str, Any]) -> Delivery:
        box = self.state.d["outbox"]
        index = self._outbox_original_index(item)
        independent = self._independent_originals.get(id(item))
        if (index is None or item.get("acknowledged") is not True
                or (index > 0 or independent is not None) and not self._independent_original_current(item, receipt=True)):
            self._custody_halted = True
            self._warn_custody("original queue identity or receipt custody changed; no delivery was adopted")
            return Delivery.HELD
        seen_before = None
        if item.get("server_expired") is True:
            original = self._verification_originals.get(id(item))
            if not self._verification_claims_owned(item, original):
                self._warn_custody("server expiry settlement lacks exact original claim ownership")
                return Delivery.HELD
            seen_before = list(self.state.d["seen"])
            self.state.d["seen"] = [claim for claim in seen_before if claim not in original["claims"]]
        box.pop(index)
        try:
            self.state.save()
        except OSError as error:
            box.insert(index, item)
            if seen_before is not None:
                self.state.d["seen"] = seen_before
            self._custody_halted = True
            self._ack_settlement_pending = ("outbox", item) if item.get("acknowledged") is True else None
            self._state_write_failed("outbox-settlement", error)
            self._warn_custody("settlement could not be persisted; original retained and dispatch stopped")
            return Delivery.HELD
        self._custody_warning = None
        self._forget_verification_original(item)
        # .268: a confirmed upload changes the display input immediately. Coalesce
        # the normal read-only pull; never wait another five minutes or redate old data.
        # Only a durably settled original can request this read, including recovery.
        if self.membership_only and item.get("path") in ("/ingest/roster", "/ingest/verify", "/ingest/intake242"):
            self._next_strict_display_pull = 0.0
            self._last_queue_pull = 0.0
        return Delivery.DELIVERED

    def _forget_verification_original(self, item: dict[str, Any]) -> None:
        self._independent_originals.pop(id(item), None)
        original = self._verification_originals.pop(id(item), None)
        if original is not None:
            for claim in original["claims"]:
                if self._verification_seen_claims.get(claim) is original:
                    self._verification_seen_claims.pop(claim, None)

    @staticmethod
    def _verification_original_current(item: dict[str, Any], original: dict[str, Any]) -> bool:
        try:
            return original["original"] is item and original["snapshot"] == json.dumps(item, sort_keys=True, allow_nan=False)
        except (KeyError, TypeError, ValueError, OverflowError):
            return False

    def _verification_claims_owned(self, item: dict[str, Any], original: dict[str, Any] | None) -> bool:
        if original is None or original.get("original") is not item:
            return False
        claims = original.get("claims")
        return (isinstance(claims, tuple) and bool(claims) and len(set(claims)) == len(claims)
                and all(self._verification_seen_claims.get(claim) is original
                        and self.state.d["seen"].count(claim) == 1 for claim in claims))

    def _captured_verification_expired(self, path: str, body: Any) -> bool:
        if not isinstance(body, dict) or body.get("source") != "whisper":
            return False
        invite = path == officer_invites233.PATH
        proof = body.get("nativeInvite" if invite else "nativeMembership")
        observed = proof.get("observedAt") if isinstance(proof, dict) else None
        lifetime = officer_invites233.TTL if invite else 600
        if type(observed) is not int or observed <= 0 or observed > int(time.time()) - lifetime:
            return False
        # Authenticate the original captured bytes at their actual captured time;
        # this grants only one server request, never renewed source authority.
        return (officer_invites233.validate(self.secret, body, observed) is not None if invite else
                validate_membership(self.secret, body.get("character", ""), body.get("guid"),
                                    body.get("code", ""), proof, observed) is not None)

    @staticmethod
    def _server_expiry_receipt(path: str, body: dict[str, Any], result: dict[str, Any]) -> bool:
        if path == officer_invites233.PATH:
            return (officer_invites233.receipt(body, result) and result.get("result") == "held"
                    and result.get("reason") == "native-source-expired")
        return (path == "/ingest/verify" and result.get("result") == "source_expired"
                and all(result.get(k) is False for k in ("pendingConsumed", "roleGranted", "inviteQueued")))

    def _dispatch_original(self, item: dict[str, Any], retries: int, settle: Any = None) -> Delivery:
        if self._custody_halted or not self._retained_original(item):
            self._warn_custody("legacy, changed or different-owner original requires attended recovery")
            return Delivery.HELD
        if settle is None and self._outbox_original_index(item) is None:
            self._warn_custody("original is missing or duplicated in durable custody; no request was made")
            return Delivery.HELD
        if item.get("acknowledged") is True:
            return (settle or self._settle_original)(item)  # a persisted receipt never causes another HTTP request
        if item.get("refusal_status") is not None:
            self._warn_custody("explicitly refused original retained for attended review")
            return Delivery.HELD
        independent = self._independent_originals.get(id(item))
        if independent is not None and not self._independent_original_current(item):
            self._warn_custody("fresh independent original changed; no request was made")
            return Delivery.HELD
        if independent is not None and self.worker.paused():
            self._warn_custody("worker transport paused; fresh original retained without a request attempt")
            return Delivery.HELD
        expired = False
        if self.membership_only and item.get("path") in ("/ingest/verify", officer_invites233.PATH):
            original = self._verification_originals.get(id(item))
            if (original is None or not self._verification_original_current(item, original)
                    or original["attempted"] is not False):
                self._warn_custody("verification original already attempted or from an earlier process; no automatic resend")
                return Delivery.HELD
            if not self._verification_claims_owned(item, original):
                self._warn_custody("verification seen claims are missing, duplicated or owned elsewhere; original retained")
                return Delivery.HELD
            expired = self._captured_verification_expired(item["path"], item.get("body"))
            if item["path"] == "/ingest/verify" and item.get("body", {}).get("nativeMembership", {}).get("member") is False:
                self._warn_custody("unattempted nonmember verification held for explicit officer evidence; original was not relabelled")
                return Delivery.HELD
            ready = (self.officer_invite_roster_ready(item.get("body")) if item["path"] == officer_invites233.PATH else self.verification_roster_ready(item.get("body")))
            if not ready and not expired:
                self._wait_for_verification_roster()
                return Delivery.HELD
            if self.worker.paused():
                self._warn_custody("worker transport paused; verification original retained without a request attempt")
                return Delivery.HELD
            original["attempted"] = True  # before transport; unknown outcomes cannot acquire a second attempt
            retries = 1
        self.worker.last_refusal = None
        if independent is not None:
            independent["attempted"] = True
        try:
            # A transport stub or caller cannot mutate the original body held in state.
            body = json.loads(json.dumps(item["body"], allow_nan=False))
            ok, res = self.worker.call("POST", item["path"], body, retries=retries)
        except Exception:
            self._warn_custody("transport outcome unknown; exact original remains held")
            return Delivery.HELD
        if ok and isinstance(res, dict):
            if independent is not None and not self._independent_original_current(item):
                self._warn_custody("fresh original changed during transport; response was not adopted")
                return Delivery.HELD
            expiry_receipt = self._server_expiry_receipt(item["path"], item.get("body", {}), res)
            if expired and not expiry_receipt:
                self._warn_custody("expired original lacks an exact server no-effect expiry receipt; original retained")
                return Delivery.HELD
            if expiry_receipt:
                if not self._verification_claims_owned(item, self._verification_originals.get(id(item))):
                    self._warn_custody("server expiry receipt cannot release another or duplicate seen claim")
                    return Delivery.HELD
                item["server_expired"] = True
            if item["path"] == officer_invites233.PATH and not officer_invites233.receipt(item["body"], res):
                self._warn_custody("officer invite application receipt unknown; exact original retained without retry")
                return Delivery.HELD
            if item["path"] == officer_invites233.PATH:
                log("officer invite: " + (res["reason"] if res["result"] == "held" else "approved for one attended native action; no role granted"))
            item["acknowledged"] = True
            source = self._verification_roster_originals.get(id(item))
            if source is not None and source["original"] is item:
                source["receipt"] = json.loads(json.dumps(res))
            if independent is not None:
                independent["receipt"] = json.dumps(item, sort_keys=True, allow_nan=False)
            result = (settle or self._settle_original)(item)
            if result is Delivery.DELIVERED:
                self.note_launch_roster_receipt(item, res)
                self.note_verification_roster_receipt(item, res)
                self._verification_originals.pop(id(item), None)
                log(f"  -> delivered{Worker.summarize(res)}")
            return result
        if ok and res is None and type(self.worker.last_refusal) is int and 400 <= self.worker.last_refusal < 500:
            item["refusal_status"] = self.worker.last_refusal
            try:
                self.state.save()
            except OSError as error:
                self._custody_halted = True
                self._state_write_failed("refusal-receipt", error)
            self._warn_custody("explicitly refused original retained for attended review")
        else:
            self._warn_custody("no application receipt; exact original remains held")
        return Delivery.HELD

    def post(self, path: str, body: Any, label: str, *, _verification_claims: tuple[str, ...] = ()) -> Delivery:
        """Reserve an exact durable original before HTTP; never evict a prior unacknowledged body."""
        box = self.state.d["outbox"]
        if self._custody_halted or len(box) >= self.max_outbox:
            self._warn_custody("no new custody available; source remains unconsumed")
            return Delivery.NO_CUSTODY
        try:
            item = self._freeze_original(path, body, label)
        except (TypeError, ValueError, OverflowError):
            self._warn_custody("body cannot be retained exactly; source remains unconsumed")
            return Delivery.NO_CUSTODY
        original = self._verification_originals.get(id(item))
        if original is not None:
            original["claims"] = _verification_claims
            for claim in _verification_claims:
                self._verification_seen_claims[claim] = original
        box.append(item)
        try:
            self.state.save()
        except OSError as error:
            # Atomic replace may have an uncertain local outcome. Retain the in-memory original,
            # dispatch nothing, stop new custody, and leave the source cursor uncommitted.
            self._custody_halted = True
            self._state_write_failed("reservation", error)
            self._warn_custody("custody persistence failed; dispatch stopped and source remains unconsumed")
            return Delivery.NO_CUSTODY
        if self.membership_only:
            roster = self._verification_roster_originals.get(id(item))
            verification = self._verification_originals.get(id(item))
            if ((path == "/ingest/roster" and roster is not None and roster.get("original") is item
                 and item.get("body") == roster.get("body"))
                    or (path in ("/ingest/verify", officer_invites233.PATH) and verification is not None
                        and self._verification_original_current(item, verification) and self._verification_claims_owned(item, verification))):
                self._independent_originals[id(item)] = {"original": item, "snapshot": json.dumps(item, sort_keys=True, allow_nan=False),
                                                        "attempted": False, "receipt": None}
        if box[0] is not item:
            if not self._independent_original_ready(item):
                return Delivery.HELD  # legacy/old originals retain FIFO; none is relabelled or removed
        return self._dispatch_original(item, retries=3)

    def _post_claimed(self, path: str, body: Any, label: str, keys: list[str]) -> Delivery:
        if self.membership_only and path in ("/ingest/verify", officer_invites233.PATH) and not self._captured_verification_expired(path, body) and not (
                self.officer_invite_roster_ready(body) if path == officer_invites233.PATH else self.verification_roster_ready(body)):
            self._wait_for_verification_roster()
            raise VerificationDeferred()
        before = list(self.state.d["seen"])
        claims = []
        for key in keys:
            if not self.state.seen(key):
                claims.append(self.state._k(key))
        result = (self.post(path, body, label, _verification_claims=tuple(claims))
                  if self.membership_only and path in ("/ingest/verify", officer_invites233.PATH) else self.post(path, body, label))
        if result is Delivery.NO_CUSTODY:
            self.state.d["seen"] = before
            raise NoCustody("source paused until original custody is available")
        return result

    def recover_local_settlement(self) -> bool:
        """Retry local persistence of this process's actual ACK; never dispatch HTTP."""
        pending = self._ack_settlement_pending
        if not self._custody_halted or pending is None:
            return False
        lane, original = pending
        if original.get("acknowledged") is not True or not self._retained_original(original):
            return False
        if lane == "outbox":
            box = self.state.d["outbox"]
            if self._outbox_original_index(original) is None:
                return False
            result = self._settle_original(original)
        elif lane == "queue-written":
            if (self.state.d.get("queue_written_original") is not original
                    or original.get("body", {}).get("ids") != self.state.d.get("queue_written_pending")):
                return False
            result = self._settle_written_original(original)
        else:
            return False
        if result is not Delivery.DELIVERED:
            return False
        if lane == "outbox":
            source = self._verification_roster_originals.get(id(original))
            if source is not None and source["original"] is original and isinstance(source.get("receipt"), dict):
                self.note_verification_roster_receipt(original, source["receipt"])
        self._ack_settlement_pending = None
        self._custody_halted = False
        self._custody_warning = None
        log("local acknowledged settlement persisted; no request was repeated")
        return True

    def flush_outbox(self) -> None:
        """Keep legacy FIFO; fresh owned Native originals have independent first-attempt custody."""
        box = self.state.d["outbox"]
        if not box:
            return
        sent = 0
        for _ in range(max(0, self.max_outbox)):
            if not box or self._custody_halted:
                break
            item = box[0]
            result = self._dispatch_original(item, retries=1)
            if result is Delivery.EXPIRED_LOCAL:
                continue  # local expiry advances custody, never the delivered/ACK counter
            if result is not Delivery.DELIVERED:
                break
            sent += 1
        # A spent/unknown original does not authorize its own retry or block an
        # unrelated freshly captured original. Never adopt a reloaded row here.
        for item in list(box)[:max(0, self.max_outbox)]:
            if self._custody_halted:
                break
            if box and item is box[0]:
                continue  # the head already had its ordinary turn in this flush
            if self._independent_original_ready(item):
                if self._dispatch_original(item, retries=1) is Delivery.DELIVERED:
                    sent += 1
        if sent:
            log(f"outbox: delivered {sent} buffered post(s), {len(box)} left")

    # ---------- 1. chat log ----------
    FP_BYTES = 256

    def _log_fingerprint(self) -> str:
        """Identity of the current log file. st_ino is unreliable on Windows, so hash a fixed-size prefix instead: a
        recreated or rotated log will not match, and we start at its end rather than seeking into the middle of it.
        Returns "" while the file is shorter than the prefix, because a growing prefix would look like a new file."""
        try:
            with open(self.chat_log, "rb") as f:
                head = f.read(self.FP_BYTES)
        except OSError:
            return ""
        if len(head) < self.FP_BYTES:
            return ""
        return hashlib.sha256(head).hexdigest()[:16]

    def tail_chat_log(self) -> None:
        if not self.chat_log.exists():
            return
        size = self.chat_log.stat().st_size
        off = self.state.d["chat_offset"]
        fp = self._log_fingerprint()

        # First run, a truncated log, or a different file under the same name: jump to the end and never replay
        # history. "chat_init" is what makes this safe — inferring it from "size == 0 and off == 0" re-armed the
        # first-run branch every time the log was emptied, and the next poll then skipped whatever had been written.
        rotated = bool(self.state.d.get("chat_fp")) and bool(fp) and fp != self.state.d["chat_fp"]
        if not self.state.d.get("chat_init") or size < off or rotated:
            if self.state.d.get("chat_init"):
                log(f"chat log reset (size {size} < offset {off}, or a new file); resuming at the end")
            self.state.d["chat_offset"] = size
            self.state.d["chat_size"] = size
            if fp:
                self.state.d["chat_fp"] = fp
            self.state.d["chat_init"] = True
            self.state.save()
            return
        if size == off:
            return

        # Binary read: mixing TextIOWrapper.tell() with byte counts was wrong for any non-UTF-8 byte, because
        # errors="replace" turns one bad byte into a three-byte U+FFFD.
        with open(self.chat_log, "rb") as f:
            f.seek(off)
            chunk = f.read(size - off)
        consumed = len(chunk)
        nl = chunk.rfind(b"\n")
        if nl == -1:
            return  # no complete line yet; wait for more
        tail = chunk[nl + 1 :]
        chunk = chunk[: nl + 1]
        consumed -= len(tail)
        # 0.6.9: split on "\n" only. str.splitlines() also breaks at U+2028, U+0085, \x0b and similar, so one relayed
        # chat line could carry a second, forged "... whispers: !verify" line inside it.
        lines = [raw.strip("\r\n\ufeff") for raw in chunk.decode("utf-8", errors="replace").split("\n") if raw.strip("\r\n\ufeff")]
        # When an identity note and its confirmed whisper share this read, process the note first so the relayed
        # verification can carry the character's GUID. This does not assume when the client writes either line.
        for line in lines:
            if "ref OLVg-" in line:
                self.read_identity(line)
            if "ref OLVm-" in line:
                self.read_native_membership(line)
        deferred = False
        for line in lines:
            try:
                self.handle_chat_line(line)
            except VerificationDeferred:
                deferred = True
        if deferred:
            return  # original disk lines remain unclaimed; other signed events deduplicate normally
        self.state.d["chat_offset"] = off + consumed
        self.state.d["chat_size"] = size
        if fp:
            self.state.d["chat_fp"] = fp
        self.state.save()

    def handle_chat_line(self, line: str) -> None:
        if "OLVDIAG" in line and OUT_WHISPER_RE.match(line):
            # only the officer's own outgoing lines: anyone can whisper or emote the word
            self.note_diag_line(line)
        if self.handle_signed_membership(line) or self.handle_signed_treasury(line) or self.handle_signed_join(line) or self.handle_signed_leave(line) or self.handle_signed_relay(line) or self.handle_signed_identity(line):
            return
        m = WHISPER_RE.match(line)
        if not m:
            self.handle_guild_line(line)
            return
        sender, text = m.group("sender").strip(), m.group("text")
        v = VERIFY_RE.match(text)
        if not v:
            return
        code = codes.strict_code(v.group("code"))
        if not code:
            log(f"whisper from {sender}: malformed code (not forwarded)")
            return
        self.note_lag("whisper", line)
        # Checked before it is marked seen: a code this PC's clock cannot accept yet (just after midnight UTC on a slow
        # clock) must still go through when it is whispered again, not be remembered as done.
        kind = codes.code_kind(self.secret, sender, code)
        if not kind:
            log(f"whisper from {sender}: invalid/expired code (not forwarded)")
            return
        key = self.code_key("w", sender, code)
        if self.state.was_seen(key):
            self.note_ticket_reuse(sender, code)
            return
        native = self._native_membership.get(key)
        if self.membership_only and (not native or validate_membership(self.secret, sender, native.get("guid"), code, native.get("nativeMembership"), int(time.time())) is None):
            # The following authenticated self-note or SavedVariables fallback
            # will relay this actual whisper. An old GUID note is not current
            # membership and the host never invents a positive assertion.
            return
        if self.membership_only and native and native["nativeMembership"]["member"] is False:
            self._warn_custody("new nonmember whisper is waiting for explicit WHO/unit officer proof; no verification request sent")
            return
        self.note_ticket_sender(sender, code)
        body = {"character": sender, "code": code, "source": "whisper", "ts": int(time.time()), "officer": self.officer}
        guid = self.identity_of(sender)
        if self.membership_only and native:
            guid = native["guid"]
            body["nativeMembership"] = native["nativeMembership"]
        if guid:
            body["guid"] = guid
        log(f"whisper from {sender}: valid {'request ' if kind == 'ticket' else ''}code, forwarding{' (character ID known)' if guid else ''}")
        self._post_claimed("/ingest/verify", body, f"verify {sender}", [key])
        self.state.save()

    @staticmethod
    def code_key(source: str, sender: str, code: str) -> str:
        """A character code is relayed once per sender; a request code once in all -- whoever whispers it first is the
        character it links, here, in the addon (which refuses it from anyone else) and in the Worker alike."""
        if len(code) == codes.TICKET_LENGTH:
            return f"t:{code}"
        return f"{source[0]}:{codes.normalize_character(sender)}:{code}"

    def _ticket_digest(self, code: str) -> str:
        return hashlib.sha256(f"ticket:{code}".encode("utf-8")).hexdigest()[:16]

    def note_ticket_sender(self, sender: str, code: str) -> None:
        if len(code) != codes.TICKET_LENGTH:
            return
        book = self.state.d.setdefault("tickets", {})
        cutoff = time.time() - 48 * 3600
        for k in [k for k, v in book.items() if not isinstance(v, list) or len(v) != 2 or v[1] < cutoff]:
            del book[k]
        book.setdefault(self._ticket_digest(code), [codes.normalize_character(sender), int(time.time())])

    def note_ticket_reuse(self, sender: str, code: str) -> None:
        if len(code) != codes.TICKET_LENGTH:
            return
        first = (self.state.d.get("tickets") or {}).get(self._ticket_digest(code))
        if isinstance(first, list) and first and first[0] != codes.normalize_character(sender):
            log(f"whisper from {sender}: that request code was already used by another character (not forwarded)")

    # ---------- timing: does the chat log reach disk in seconds? ----------
    def note_lag(self, kind: str, line: str) -> None:
        """Elapsed time from the line's client timestamp to this read, without attributing its cause to a flush,
        batch or reload. Backlog after a restart is not counted."""
        t = line_epoch(line)
        if t is None:
            return
        lag = time.time() - t
        if lag < -120 or lag > 3600:
            return
        samples = self.state.d.setdefault("lag", [])
        samples.append([kind, round(max(lag, 0.0), 1), int(time.time())])
        del samples[:-60]

    def lag_summary(self) -> str:
        samples = [s for s in self.state.d.get("lag") or [] if isinstance(s, list) and len(s) == 3]
        if not samples:
            return "no whisper or guild line read since the lag measurement started"
        lags = [float(s[1]) for s in samples]
        fast = sum(1 for x in lags if x <= 10)
        return (f"{len(lags)} line(s): median {statistics.median(lags):.0f}s, slowest {max(lags):.0f}s, "
                f"{fast} within 10s (file observation only)")

    def note_diag_line(self, line: str) -> None:
        for m in DIAG_RE.finditer(line):
            self.record_diag(m["tag"], int(m["epoch"]), "WoWChatLog.txt")

    def record_diag(self, tag: str, epoch: int, where: str) -> None:
        diag = self.state.d.setdefault("diag", [])
        if any(d.get("tag") == tag and d.get("epoch") == epoch and d.get("file") == where for d in diag if isinstance(d, dict)):
            return
        lag = round(time.time() - epoch, 1)
        diag.append({"tag": tag, "epoch": epoch, "file": where, "lag": lag, "seenAt": int(time.time())})
        del diag[:-30]
        log(f"diag: marker '{tag}' reached {where} {lag:.0f}s after it was written")
        self.state.save()

    def _snapshot_log_sizes(self) -> dict[str, float]:
        """Where each of the other logs ends now: only what is written after this is looked at."""
        out: dict[str, float] = {}
        try:
            for f in self.logs_dir.glob("*.log"):
                out[f.name] = f.stat().st_size
        except OSError:
            pass
        return out

    def scan_diag_logs(self) -> None:
        """The client's other logs (Client.log, DeveloperLog.log, ...) looked at only for OLVDIAG markers, to learn where
        C_Log.LogMessage writes and how soon. Only the bytes added since the last look, at most the last 64 KiB of them."""
        if time.time() - self._last_diag_scan < 10:
            return
        self._last_diag_scan = time.time()
        try:
            files = list(self.logs_dir.glob("*.log"))
        except OSError:
            return
        for f in files:
            try:
                size = f.stat().st_size
            except OSError:
                continue
            start = self._log_sizes.get(f.name, 0)
            if size == start:
                continue
            if size < start:
                start = 0  # recreated at client start
            self._log_sizes[f.name] = size
            try:
                with open(f, "rb") as fh:
                    fh.seek(max(start, size - 65536))
                    added = fh.read(size - max(start, size - 65536)).decode("utf-8", errors="replace")
            except OSError:
                continue
            for m in DIAG_RE.finditer(added):
                self.record_diag(m["tag"], int(m["epoch"]), f.name)

    # ---------- presence: is this officer's client in the world? ----------
    def _wow_running(self) -> bool | None:
        """True/False from the process list on Windows; None where that cannot be asked (tests, other systems)."""
        if os.name != "nt":
            return None
        try:
            exes = sorted({p.name for p in self.wow_dir.glob("Wow*.exe")})
        except OSError:
            exes = []
        if not exes:
            return None
        try:
            raw = subprocess.run(["tasklist", "/FO", "CSV", "/NH"], capture_output=True, timeout=15,
                                 creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
        except (OSError, subprocess.SubprocessError):
            return None
        # Bytes, decoded here: tasklist writes the OEM code page, and decoding it as the locale's (text=True) raised on
        # the first process name with a byte that code page lacks. Only ASCII executable names are looked for, and
        # latin-1 maps every byte to something, so this cannot fail.
        out = (raw or b"").decode("latin-1").lower()
        return any(f'"{e.lower()}"' in out for e in exes)

    def _client_in_world(self) -> bool | None:
        """From Logs/Client.log: the last of "Active Player Created" and the client's logout/exit lines wins."""
        path = self.logs_dir / "Client.log"
        try:
            with open(path, "rb") as fh:
                size = fh.seek(0, os.SEEK_END)
                fh.seek(max(0, size - 262144))
                tail = fh.read().decode("utf-8", errors="replace")
        except OSError:
            return None
        last_in = tail.rfind(CLIENT_IN)
        last_out = max(tail.rfind(x) for x in CLIENT_OUT)
        if last_in < 0 and last_out < 0:
            return None
        return last_in > last_out

    def officer_online(self) -> bool | None:
        if time.time() - self._presence_at < 20:
            return self._presence
        running = self._wow_running()
        in_world = self._client_in_world()
        # 0.6.5 (1 Oct 2026; the v3 proposal's presence repair, Codex manifest a086e904…, countersigned 02:15 UTC): online
        # needs BOTH a known running process and a known in-world line; a known stopped process is offline whatever the
        # log says (a crashed client leaves "in the world" behind); anything partly unknown claims nothing, so the query
        # omits `online` and /verify never names an officer as in the world on the strength of a running process alone
        # (a login screen) or a chat line alone. Until 0.6.4 a running process with no readable client log was "online".
        if running is False:
            now_on: bool | None = False
        elif running is True and in_world is not None:
            now_on = in_world
        else:
            now_on = None
        if now_on is not None and now_on != self._presence and self.officer:
            log(f"relay: {self.relay_character()} is {'in the world — /verify tells applicants to whisper you' if now_on else 'not in the world — /verify says no officer is online'}")
        self._presence, self._presence_at = now_on, time.time()
        return now_on

    def presence_query(self) -> str:
        """Never allowed to cost the queue poll it rides on: any failure here reports nothing."""
        if not self.report_presence:
            return ""
        try:
            on = self.officer_online()
            q = {"relay": self.relay_character(), "v": WATCHER_VERSION}
            r = self.state.d.get("relay") or {}
            addon = str(r.get("addon") or "")
            if addon and time.time() - float(r.get("at") or 0) < RELAY_NOTE_VALID:
                q["addon"] = addon  # an old note says nothing about the addon loaded now (a downgrade, say)
            if on is not None:
                q["online"] = "1" if on else "0"
            return "&" + urllib.parse.urlencode(q)
        except Exception as e:  # noqa: BLE001
            log(f"relay: presence check failed ({e!r}); not reported this time")
            return ""

    def handle_signed_join(self, line: str) -> bool:
        """An outgoing whisper from the officer's own client carrying the addon's HMAC. Only that client writes
        "To <name>:" lines into this file, and only the addon knows the secret, so this is proof that the addon
        itself saw the character on the guild roster (C_GuildInfo.MemberExistsByName)."""
        m = OUT_WHISPER_RE.match(line)
        if not m:
            return False
        t = JOIN_TOKEN_RE.search(m.group("text"))
        if not t:
            return False
        name = m.group("name").strip()
        note = JOIN_SELF_RE.match(m.group("text").strip())
        if note:
            name = note.group("joined").strip()
        if t.group("mac") not in codes.valid_join_tokens(self.secret, name):
            log(f"join token for {name} did not verify (ignored)")
            return True
        # "J:" -- trusted events have their own dedupe namespace. Sharing "j:" with the untrusted chat-log line meant the
        # system line ("X has joined the guild.", always written first) claimed the key and this signed note, the
        # one that can grant the role, was dropped as a duplicate (found 27 Sep).
        key = f"J:{codes.normalize_character(name)}:{int(line_epoch(line) or time.time()) // 600}"
        if self.state.was_seen(key):
            return True
        self.note_lag("signed", line)
        log(f"guild: {name} joined (addon-signed); forwarding")
        self._post_claimed("/ingest/events", {"events": [{"type": "joined", "name": name, "ts": int(time.time()), "ok": True, "origin": "token", "detail": "addon-confirmed"}]}, f"joined {name}", [key])
        self.state.save()
        return True

    def handle_signed_leave(self, line: str) -> bool:
        """The addon's signed note that someone left or was removed. CHAT_MSG_SYSTEM cannot be forged by another client,
        but the chat-log text can (/emote), so only the note -- which carries an HMAC over the name and the kind --
        takes the role away at once; the plain line only flags it for the next roster export."""
        m = OUT_WHISPER_RE.match(line)
        if not m:
            return False
        t = LEAVE_TOKEN_RE.search(m.group("text"))
        if not t:
            return False
        note = LEAVE_SELF_RE.match(m.group("text").strip())
        if not note:
            return True
        name, kind = note.group("name").strip(), LEAVE_KIND[note.group("what")]
        if t.group("mac") not in codes.valid_leave_tokens(self.secret, kind, name):
            log(f"departure token for {name} did not verify (ignored)")
            return True
        key = f"L:{codes.normalize_character(name)}:{int(line_epoch(line) or time.time()) // 600}"
        if self.state.was_seen(key):
            return True
        self.note_lag("signed", line)
        if kind in ("space", "unverified"):
            ev = {"type": "removed", "reason": kind, "detail": "freed a seat (addon-signed)" if kind == "space" else "not verified (addon-signed)"}
        else:
            ev = {"type": "left", "detail": "left the guild (addon-signed)" if kind == "left" else "removed from the guild (addon-signed)"}
        ev.update({"name": name, "ts": int(time.time()), "ok": True, "origin": "token"})
        log(f"guild: {name} — {ev['detail']}; forwarding")
        self._post_claimed("/ingest/events", {"events": [ev]}, f"{ev['type']} {name}", [key])
        self.state.save()
        return True

    def handle_signed_relay(self, line: str) -> bool:
        """The addon's note at login or /reload: which character is in the world and which addon build it runs."""
        m = OUT_WHISPER_RE.match(line)
        if not m or "ref OLVr-" not in m.group("text"):
            return False
        note = RELAY_SELF_RE.match(m.group("text").strip())
        if not note:
            return True
        name, ver = note.group("name").strip(), note.group("ver")
        if note.group("mac") not in codes.valid_relay_tokens(self.secret, name, ver):
            log(f"relay note for {name} did not verify (ignored)")
            return True
        # A note to self: the line only exists because the server delivered it to that name, so the name it carries
        # has to be the one it was addressed to -- the proof that applicants can whisper it too.
        if codes.normalize_character(m.group("name")) != codes.normalize_character(name):
            log(f"relay note names {name} but was addressed to {m.group('name').strip()} (ignored)")
            return True
        prev = self.state.d.get("relay") or {}
        at = int(line_epoch(line) or time.time())
        if at < float(prev.get("at") or 0):
            return True  # written before what we already know (a batch the client wrote late): the newer word stands
        self.state.d["relay"] = {"character": name, "addon": ver, "at": at, "from": "note"}
        if prev.get("character") != name or prev.get("addon") != ver:
            log(f"relay: {name} is in the world with addon {ver} — /verify names {name}" + ("" if self.report_presence else " (presence reports are off)"))
            self._presence_at = 0.0  # report the new character on the next poll, not up to 20 s later
        self.state.save()
        return True

    def read_identity(self, line: str) -> tuple[str, str] | None:
        """A verified identity note on an outgoing line, remembered for IDENTITY_TTL; (name, guid) or None."""
        m = OUT_WHISPER_RE.match(line)
        if not m or "ref OLVg-" not in m.group("text"):
            return None
        note = GUID_SELF_RE.match(m.group("text").strip())
        if not note:
            return None
        name, guid = note.group("name").strip(), note.group("guid")
        if note.group("mac") not in codes.valid_guid_tokens(self.secret, name, guid):
            return None
        book = self.state.d.setdefault("identities", {})
        cutoff = time.time() - IDENTITY_TTL
        for k in [k for k, v in book.items() if not isinstance(v, list) or len(v) != 2 or v[1] < cutoff]:
            del book[k]
        book[codes.normalize_character(name)] = [guid, int(time.time())]
        return name, guid

    def identity_of(self, name: str) -> str | None:
        v = (self.state.d.get("identities") or {}).get(codes.normalize_character(name))
        return v[0] if isinstance(v, list) and len(v) == 2 and time.time() - v[1] < IDENTITY_TTL and codes.is_guid(v[0]) else None

    def handle_signed_identity(self, line: str) -> bool:
        """The addon's note naming the character that whispered a valid code. Usually its GUID has already gone out with
        the verification (read ahead in tail_chat_log); it is also relayed on its own, which pins a link made without it."""
        m = OUT_WHISPER_RE.match(line)
        if not m or "ref OLVg-" not in m.group("text"):
            return False
        got = self.read_identity(line)
        if not got:
            log("identity note did not verify (ignored)")
            return True
        name, guid = got
        key = f"g:{codes.normalize_character(name)}:{guid}"
        if self.state.was_seen(key):
            return True
        self._post_claimed("/ingest/events", {"events": [{"type": "identity", "name": name, "guid": guid, "ts": int(time.time()), "ok": True, "origin": "token"}]}, f"identity {name}", [key])
        self.state.save()
        return True

    def note_saved_relay(self, db: dict[str, Any], mtime: float) -> None:
        """The loaded addon build and the character, as the addon saved them at the last /reload or logout. The signed
        login note in the chat log says the same sooner in principle, but the client writes that file only every 48 KiB of
        chat (measured 27 Sep: lines waited minutes), so this is what lets request codes start without waiting for it.
        Only the addon writes this file, so no MAC is needed. Whichever of the two is newer wins.

        The character is the one applicants will be told to whisper, so it has to be a name the server knows. Addon 0.6.1
        saved UnitName("player"), which on the 27 Sep client is only the first part of a two-part name ("Fern" for Fern
        Melder: "No player named 'Fern' is currently playing."). So the name is taken from this file's own roster export,
        the member with the GUID the addon saved (0.6.2 on). Without one, the character stays what it was (the configured
        officer by default) and only the addon build is taken."""
        ver = db.get("addonVersion") or db.get("presenceVersion")  # presenceVersion: written by every build since 0.5.3
        if not isinstance(ver, str) or not re.match(r"^[0-9][0-9A-Za-z.+-]{0,15}$", ver):
            return
        r = self.state.d.get("relay") or {}
        if float(r.get("at") or 0) >= mtime:
            return  # a login note read since is newer
        name = saved_character(db)
        said = db.get("lastCharacter")
        if name is None and isinstance(said, str) and said.strip() and said.strip() != self.state.d.get("relay_refused"):
            self.state.d["relay_refused"] = said.strip()
            log(f"relay: SavedVariables names '{said.strip()[:40]}' without a character ID the roster knows — keeping {self.relay_character()}")
        if name:
            new = {"character": name, "addon": ver, "at": int(mtime), "from": "roster"}
        else:
            kept = r.get("from") in RELAY_TRUSTED and str(r.get("character") or "").strip()
            new = {"character": kept or "", "addon": ver, "at": int(mtime), "from": r.get("from") if kept else "savedvariables"}
        if new["addon"] != r.get("addon") or new["character"] != r.get("character"):
            log(f"relay: SavedVariables says addon {ver}" + (f" on {new['character']}" if new["character"] else ""))
        self.state.d["relay"] = new
        self._presence_at = 0.0

    def relay_character(self) -> str:
        """Who to name: the character the addon last said it is on, when that came from a trusted source (RELAY_TRUSTED),
        else the configured officer character."""
        r = self.state.d.get("relay") or {}
        name = str(r.get("character") or "").strip() if r.get("from") in RELAY_TRUSTED else ""
        return name or self.officer

    def handle_guild_line(self, line: str) -> None:
        """Relay unverified chat-log joins and departures. This forgeable source can only arm a removal, never grant
        or strip a role; trusted events and roster exports retain their separate authority."""
        s = SYSTEM_RE.match(line)
        if not s:
            return
        text = s.group("text").strip()
        ev: dict[str, Any] | None = None
        if (m := GUILD_JOIN_RE.match(text)):
            ev = {"type": "joined", "name": m.group("name").strip(), "detail": "chat log: joined"}
        elif (m := GUILD_LEAVE_RE.match(text)):
            ev = {"type": "left", "name": m.group("name").strip(), "detail": "left the guild"}
        elif (m := GUILD_KICK_RE.match(text)):
            ev = {"type": "left", "name": m.group("name").strip(), "detail": f"kicked by {m.group('by').strip()}"}
        if not ev:
            return
        # One bucket per character per ten minutes, shared with the addon path, so a join seen both in the chat log
        # and in SavedVariables is forwarded once instead of being announced twice.
        bucket = int(line_epoch(line) or time.time()) // 600
        key = f"{'j' if ev['type'] == 'joined' else 'l'}:{codes.normalize_character(ev['name'])}:{bucket}"
        if self.state.was_seen(key):
            return
        self.note_lag("system", line)
        ev["ts"] = int(time.time())
        ev["ok"] = True
        ev["origin"] = "chatlog"  # forgeable with /emote: the Worker will not grant or remove a role on this alone
        log(f"guild: {ev['name']} — {ev['detail']} (chat log, unverified); forwarding")
        self._post_claimed("/ingest/events", {"events": [ev]}, f"{ev['type']} {ev['name']}", [key])
        self.state.save()

    def read_native_membership(self, line: str) -> dict[str, Any] | None:
        outgoing = OUT_WHISPER_RE.match(line)
        if not outgoing or "ref OLVm-" not in outgoing.group("text"):
            return None
        if codes.normalize_character(outgoing.group("name")) != codes.normalize_character(self.officer):
            return None
        row = parse_membership_note(outgoing.group("text").strip())
        if row is None or not codes.code_kind(self.secret, row["character"], row["code"]):
            return None
        at = int(time.time())
        proof = validate_membership(self.secret, row["character"], row["guid"], row["code"], row["nativeMembership"], at)
        if proof is None:
            return None
        self._native_membership = {key: value for key, value in self._native_membership.items() if at - 600 < value["nativeMembership"]["observedAt"] <= at + 5}
        key = self.code_key("w", row["character"], row["code"])
        prior = self._native_membership.get(key)
        if (prior is not None or len(self._native_membership) < 1000) and (prior is None or prior["nativeMembership"]["observedAt"] <= proof["observedAt"]):
            self._native_membership[key] = row
        return self._native_membership.get(key, row)

    def handle_signed_membership(self, line: str) -> bool:
        outgoing = OUT_WHISPER_RE.match(line)
        if not outgoing or "ref OLVm-" not in outgoing.group("text"):
            return False
        row = self.read_native_membership(line)
        if not self.membership_only or row is None:
            return True
        key = self.code_key("w", row["character"], row["code"])
        if self.state.was_seen(key):
            return True
        if row["nativeMembership"]["member"] is False:
            self._warn_custody("new nonmember whisper is waiting for explicit WHO/unit officer proof; no verification request sent")
            return True
        self.note_ticket_sender(row["character"], row["code"])
        body = {**row, "source": "whisper", "ts": row["nativeMembership"]["observedAt"], "officer": self.officer}
        self._post_claimed("/ingest/verify", body, "native membership verification", [key])
        self.state.save()
        return True

    def handle_signed_treasury(self, line: str) -> bool:
        outgoing = OUT_WHISPER_RE.match(line)
        if not outgoing or "ref OLVt-" not in outgoing.group("text"):
            return False
        recipient = outgoing.group("name").strip()
        if treasury_name(recipient) != treasury_name(self.treasury.recipient):
            return True
        event = treasury_note(outgoing.group("text").strip(), recipient)
        if event is None:
            log("treasury: invalid signed receipt format (not recorded)")
            return True
        self.record_treasury_receipt(event, "signed-chat")
        return True

    def record_treasury_receipt(self, event: dict[str, Any], source: str) -> None:
        try:
            result = self.treasury.record(event, self.secret, source)
        except (OSError, ValueError) as error:
            # Do not advance the source cursor when the independent disk receipt
            # is uncertain. No sender, amounts, MACs or filesystem errors in logs.
            raise NoCustody("treasury receipt custody unavailable; source retained") from error
        if result == "recorded":
            log("treasury: unclassified transfer recorded locally; no tithe credit or role applied")
        elif result == "refused":
            log("treasury: receipt authentication or bounds refused (not recorded)")

    def purge_treasury_receipts(self) -> None:
        current = time.time()
        if current - self._treasury_purged_at < 3600:
            return
        try:
            self.treasury.purge(int(current))
        except (OSError, ValueError) as error:
            raise NoCustody("treasury retention custody unavailable; source retained") from error
        self._treasury_purged_at = current

    # ---------- 2. SavedVariables ----------
    def check_savedvars(self) -> None:
        self.purge_treasury_receipts()
        intake242.collect(self)
        if not self.sv_file.exists():
            self._verification_roster = None
            return
        initial = self.sv_file.stat()
        mtime = initial.st_mtime
        if mtime <= self.state.d["sv_mtime"]:
            intake242.drain(self, collect_inputs=False)
            return
        time.sleep(1.0)  # WoW writes the file in one go, but give it a moment
        try:
            data = savedvars.parse_file(str(self.sv_file))
        except Exception:
            self._verification_roster = None
            log("SavedVariables parse failed: unreadable or invalid data (contents withheld)")
            self.state.d["sv_mtime"] = mtime
            self.state.save()
            return
        current = self.sv_file.stat()
        if (current.st_mtime_ns, current.st_size) != (initial.st_mtime_ns, initial.st_size):
            self._verification_roster = None
            return
        self._verification_sv_stamp = (current.st_mtime_ns, current.st_size)
        db = data.get("OlympusVerifyDB") or {}
        treasury = db.get("treasury") or {}
        receipts = treasury.get("receipts") if isinstance(treasury, dict) else None
        if isinstance(receipts, list):
            for receipt in receipts:
                if isinstance(receipt, dict) and receipt.get("status") == "confirmed_local" and receipt.get("classification") == "unclassified_receipt":
                    self.record_treasury_receipt(receipt, "savedvariables")
        self.note_saved_relay(db, mtime)
        if not self.membership_only:
            self.forward_events(db.get("events") or [])
        control = self.valid_launch_control(db)
        new_scan = (control is not None and control['action'] == 'scan'
                    and not self.state.was_seen("launch-control:" + control['guid'] + ":" + control['id']))
        if new_scan:
            self.forward_roster(db.get("roster") or {}, begin_launch_scan=True)
        else:
            self.forward_roster(db.get("roster") or {})
        intake242.drain(self, collect_inputs=False)
        if self.membership_only:
            try:
                self.forward_events(db.get("events") or [])
            except VerificationDeferred:
                return  # keep the original SavedVariables cursor until roster admission is known
        self.read_launch_control(db)
        self.state.d["sv_mtime"] = mtime
        self.state.save()

    def forward_events(self, events: list[dict[str, Any]]) -> None:
        relay: list[dict[str, Any]] = []
        relay_keys: list[str] = []
        batch_keys: set[str] = set()
        stale = 0
        for e in events:
            if not isinstance(e, dict):
                continue
            t, name, ts = e.get("type"), e.get("name") or "", int(e.get("ts") or 0)
            if t == "officer_invite_proof" and self.membership_only:
                self.forward_officer_invite(e.get("body"))
            elif t in ("whisper", "mail") and e.get("ok") and e.get("code"):
                raw = str(e["code"]).upper()
                strict = codes.strict_code(raw)
                # the same key the chat-log path used for this whisper, so it is relayed once whichever route is first
                key = self.code_key(t, name, strict) if strict else f"{t[0]}:{codes.normalize_character(name)}:{raw}"
                if not strict:
                    continue
                if (self.membership_only and intake242.handles_verify(self, name, strict or raw, e)) or self.state.was_seen(key) or key in batch_keys:
                    continue
                if strict:
                    self.note_ticket_sender(name, strict)
                body = {"character": name, "code": strict or raw, "source": t, "ts": ts, "officer": self.officer}
                if self.membership_only:
                    proof = validate_membership(self.secret, name, e.get("guid"), strict or raw, e.get("nativeMembership"), int((e.get("nativeMembership") or {}).get("observedAt") or time.time()))
                    if proof is None:
                        continue
                    if proof["member"] is False:
                        self._warn_custody("new nonmember whisper is waiting for explicit WHO/unit officer proof; no verification request sent")
                        continue
                    body["nativeMembership"] = proof
                if codes.is_guid(e.get("guid")):
                    body["guid"] = e["guid"]  # the addon read it from the whisper event itself
                log(f"{t} from {name} (SavedVariables): forwarding")
                self._post_claimed("/ingest/verify", body, f"verify {name}", [key])
            elif t == "guild_full":
                # No character of its own: key it on the minute so a burst of refused invites reports once.
                key = f"gf:{ts // 60}"
                if self.state.was_seen(key) or key in batch_keys:
                    continue
                relay_keys.append(key); batch_keys.add(key)
                cands = e.get("candidates")
                relay.append({
                    "type": t,
                    "ts": ts,
                    "ok": False,
                    "detail": str(e.get("detail") or "")[:200],
                    "origin": "addon",
                    # the addon's ranked shortlist, passed through so the Worker can post it for the officers to judge
                    "candidates": [
                        {
                            "name": str(c.get("name") or "")[:40],
                            "level": c.get("level"),
                            "rank": str(c.get("rank") or "")[:40],
                            "days": c.get("days"),
                        }
                        for c in (cands if isinstance(cands, list) else [])
                        if isinstance(c, dict)
                    ][:5],
                })
            elif t in ("invite", "note", "joined", "left", "removed"):
                # Joins and departures share the chat-log path's ten-minute bucket so the same event arriving by both
                # routes is forwarded once; invites and notes keep their own timestamped key.
                if t in ("joined", "left", "removed"):
                    if ts and ts < time.time() - SV_EVENT_MAX_AGE:
                        stale += 1
                        continue
                    # the trusted namespace, shared with the addon's signed notes in the chat log (see handle_signed_join);
                    # events from before this watcher version first ran were relayed under the old lowercase keys
                    legacy = ts < int(self.state.d.get("trusted_keys_since") or 0)
                    key = f"{('j' if t == 'joined' else 'l') if legacy else ('J' if t == 'joined' else 'L')}:{codes.normalize_character(name)}:{ts // 600}"
                else:
                    key = f"e:{t}:{codes.normalize_character(name)}:{ts}"
                if self.state.was_seen(key) or key in batch_keys:
                    continue
                ev = {
                    "type": t,
                    "name": name,
                    "ts": ts,
                    "ok": bool(e.get("ok", True)),
                    "detail": str(e.get("detail") or "")[:200],
                    # written by the addon itself, from MemberExistsByName or a real CHAT_MSG_SYSTEM
                    "origin": "addon",
                }
                if e.get("reason"):
                    ev["reason"] = str(e["reason"])[:32]
                relay.append(ev)
                relay_keys.append(key); batch_keys.add(key)
        if relay:
            self._post_claimed("/ingest/events", {"events": relay}, f"{len(relay)} addon event(s)", relay_keys)
        if stale and not getattr(self, "_stale_reported", False):
            self._stale_reported = True
            log(f"SavedVariables: {stale} join/departure event(s) older than {SV_EVENT_MAX_AGE // 3600} h not relayed (the roster export has settled them)")

    def forward_roster(self, roster: dict[str, Any], *, begin_launch_scan: bool = False) -> None:
        digest = launch_operations229.complete_roster_digest(roster)
        verification = verification_roster_source(roster) if self.membership_only else None
        verified = self._verification_roster
        if verification is None or verified is not None and verification['digest'] != verified["digest"]:
            self._verification_roster = None
        accepted = self._launch_accepted_roster
        first = self.launch_scan.pages.get(0)
        at = time.time()
        if (verified is not None and verification is not None and verification['digest'] == verified["digest"]
                and type(roster.get("exportedAt")) is int and verified["exportedAt"] <= roster["exportedAt"] <= at + 5):
            # Only the observed file stamp follows an identical complete export.
            # Neither the original source timestamp nor its ACK deadline is renewed.
            verified["fileStamp"] = self._verification_sv_stamp
        if (not begin_launch_scan and self.membership_only and digest is not None and accepted is not None and first is not None
                and self.launch_scan.stopped is None and at < first['scan']['expiresAt']
                and first['snapshotId'] == accepted['snapshot'] and first['snapshotAt'] == accepted['exportedAt']
                and first['snapshotAt'] == self.state.d['roster_sent'] and digest == accepted['digest']
                and roster['exportedAt'] >= accepted['exportedAt'] and roster['exportedAt'] <= at + 5
                and first['guild'] == roster['nativeGuild'] and first['realm'] == roster['nativeRealm']):
            # Mandatory PLAYER_LOGOUT exports may change only the timestamp. Keep the accepted
            # original's exact source cutoff; no new source/scan freshness is asserted.
            return
        if first is not None and self.launch_scan.stopped is None:
            self.launch_scan._stop('native-roster-changed-or-expired')
            self.write_launch_operations()
        self._launch_accepted_roster = None
        self._launch_roster_candidate = None
        exported = int(roster.get("exportedAt") or 0)
        members = roster.get("members") or []
        native_scope = {}
        for field in ("nativeGuild", "nativeRealm"):
            value = roster.get(field)
            if isinstance(value, str) and 0 < len(value.encode("utf-8")) <= 128 and not any(ord(c) < 32 or ord(c) == 127 for c in value):
                native_scope[field] = value
        # Scope is part of source identity, including an otherwise identical
        # export at the same second. Never let an older export replace a newer
        # one, and retain old unscoped watermarks without an unsolicited replay.
        scope_hash = hashlib.sha256(json.dumps(native_scope, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()
        prior_scope_hash = self.state.d.get("roster_scope_hash")
        same_scope = prior_scope_hash == scope_hash or prior_scope_hash is None and not native_scope
        if not exported or exported < self.state.d["roster_sent"] or exported == self.state.d["roster_sent"] and same_scope or not isinstance(members, list):
            return
        self._verification_roster = None  # a newer pending/refused source never borrows an older positive ACK
        payload = {
            "exportedAt": exported,
            "members": [
                {
                    "name": m.get("name", ""),
                    "rank": m.get("rank"),
                    "rankIndex": m.get("rankIndex"),
                    "level": m.get("level"),
                    "class": m.get("class"),
                    "note": m.get("note"),
                    "officerNote": m.get("onote"),
                    "guid": m.get("guid"),
                    "lastOnline": m.get("lastOnline"),
                }
                for m in members
                if isinstance(m, dict) and m.get("name")
            ],
        }
        # Preserve actual client scope; the host never manufactures a guild/realm
        # from its configuration or a character claim. The Worker pins it before
        # admitting a launch roster. Older addons remain unscoped, not guessed.
        payload.update(native_scope)
        self._verification_roster_candidate = None
        if digest is not None:
            self._launch_roster_candidate = {'body': json.loads(json.dumps(payload)), 'digest': digest, 'exportedAt': exported}
        if verification is not None:
            self._verification_roster_candidate = {**verification, "body": json.loads(json.dumps(payload)),
                "exportedAt": exported, "fileStamp": self._verification_sv_stamp}
        log(f"roster ({len(payload['members'])} members, exported {exported})")
        previous_watermark = self.state.d["roster_sent"]
        self.state.d["roster_sent"] = exported  # committed atomically with custody, before any dispatch
        self.state.d["roster_scope_hash"] = scope_hash
        outcome = self.post("/ingest/roster", payload, f"roster {exported}")
        if outcome is Delivery.NO_CUSTODY:
            self.state.d["roster_sent"] = previous_watermark
            if prior_scope_hash is None:
                self.state.d.pop("roster_scope_hash", None)
            else:
                self.state.d["roster_scope_hash"] = prior_scope_hash
            raise NoCustody("roster source paused until original custody is available")
        if outcome is Delivery.DELIVERED:
            self._last_unverified_pull = 0.0  # the list is derived from the roster: refresh it on the next queue pull

    def note_launch_roster_receipt(self, item: dict[str, Any], receipt: dict[str, Any]) -> None:
        candidate = self._launch_roster_candidate
        if (item.get('path') == '/ingest/roster' and candidate is not None and item.get('body') == candidate['body']
                and receipt.get('trusted') is True and type(receipt.get('snapshot')) is int and receipt['snapshot'] > 0
                and type(receipt.get('members')) is int and receipt['members'] == len(candidate['body']['members'])
                and 'refused' not in receipt and 'skipped' not in receipt):
            self._launch_accepted_roster = {'digest': candidate['digest'], 'exportedAt': candidate['exportedAt'], 'snapshot': receipt['snapshot']}
        self._launch_roster_candidate = None

    # ---------- 3. invite queue ----------
    def pull_unverified(self) -> None:
        """Refresh the cached unverified list. Keeps the previous copy on any failure: a stale list in the addon is
        re-checked against the live roster there, whereas an empty one would silently hide everyone."""
        if time.time() - self._last_unverified_pull < self.unverified_poll:
            return
        self._last_unverified_pull = time.time()
        ok, res = self.worker.call("GET", "/queue/unverified", retries=1)
        if not ok or not isinstance(res, dict) or not isinstance(res.get("members"), list):
            if ok and res is None:
                log("unverified list: this Worker build does not serve /queue/unverified yet (deploy .34)")
            return
        slim = {
            "snapshotAt": int((res.get("snapshot") or {}).get("exportedAt") or 0),
            "graceDays": int(res.get("graceDays") or 0),
            "verifyOpenSince": int(res.get("verifyOpenSince") or 0),
            "firstSeenAvailable": bool(res.get("firstSeenAvailable")),
            "openTickets": int(res.get("openTickets") or 0),
            "ranks": [
                {k: r.get(k) for k in ("rank", "rankIndex", "total", "unverified")}
                for r in res.get("ranks") or [] if isinstance(r, dict)
            ],
            "members": [
                {k: m.get(k) for k in ("name", "rank", "rankIndex", "level", "firstSeen", "eligibleAt", "pending")}
                for m in res["members"] if isinstance(m, dict) and m.get("name")
            ],
            # Worker .41: the linked members on the same roster, with their Discord names, for the addon's roster
            # window (/olv members). Absent from an older Worker, which the addon shows as "no Discord names yet".
            "verified": [
                {k: m.get(k) for k in ("name", "guid", "status", "discordId", "username", "displayName")}
                for m in (res.get("verified") or []) if isinstance(m, dict) and m.get("name")
            ],
        }
        if slim != self._unverified:
            removable = sum(1 for m in slim["members"] if (m.get("eligibleAt") or 0) and m["eligibleAt"] <= time.time() and not m.get("pending"))
            log(f"unverified list: {len(slim['members'])} not verified, {removable} removable now, {len(slim['verified'])} verified with Discord names"
                + ("" if slim["firstSeenAvailable"] else " — first-seen dates missing, apply the migration"))
        self._unverified = slim

    def pull_queue(self) -> None:
        if time.time() - self._last_queue_pull < self.queue_poll:
            return
        self._last_queue_pull = time.time()
        if self._custody_halted:
            return
        if self.membership_only:
            # No legacy invite claim, render, queue file write or /queue/written ACK.
            # Presence remains useful to Get my code's whisper instructions.
            path = "/queue" + (f"?officer={urllib.parse.quote(self.officer_id)}{self.presence_query()}&presenceOnly=1" if self.officer_id else "?presenceOnly=1")
            okay, response = self.worker.call("GET", path, retries=1)
            if not okay or not isinstance(response, dict) or response.get("presenceOnly") is not True:
                log("launch presence poll not confirmed; legacy invitation data remains untouched")
                return
            self.pull_strict_display()
            receipts = intake242.receipts(self)
            # Presence stays zero-D1. This exact cache intent remains fenced by launch-membership-v1; members-only never claims invite rows.
            cache_okay, cache_response = self.worker.call("GET", "/queue?cacheOnly242=1", retries=1)
            cached = intake242.verification_results(self, cache_response) if cache_okay else []
            if receipts or cached:
                body = self.render_queue([], False, intake_receipts=receipts, verification_results=cached)
                self.queue_file.parent.mkdir(parents=True, exist_ok=True)
                atomic_local_text(self.queue_file, body)
            if cache_okay:
                self._optional_role_wake264(cache_response)
            return
        if self.state.d.get("queue_written_pending") or self.state.d.get("queue_written_original"):
            self.retry_queue_written()
            if self.state.d.get("queue_written_pending") or self.state.d.get("queue_written_original") or self._custody_halted:
                return  # never merge/rebind a newer acknowledgment into an unknown original
        self.pull_unverified()
        path = "/queue" + (f"?officer={urllib.parse.quote(self.officer_id)}{self.presence_query()}" if self.officer_id else "")
        ok, res = self.worker.call("GET", path)
        if not ok or not res:
            return
        entries = res.get("entries") or []
        receipts = intake242.receipts(self)
        cached = intake242.verification_results(self, res)
        body = self.render_queue(entries, bool(res.get("setGuildNote")), self._unverified, receipts, cached)
        # Hash the inputs, not the rendered file: generatedAt changes every second, so hashing the body meant the
        # comparison never matched and the queue file plus the state file were rewritten on every single poll.
        # The unverified list is an input too. Leaving it out would repeat the .24 trap, where new data changed and the
        # gate still said "unchanged", so the file never reached the addon.
        h = hashlib.sha256(json.dumps({"e": entries, "n": bool(res.get("setGuildNote")), "u": self._unverified, "intakeReceipts242": receipts, "verificationResults242": cached}, sort_keys=True).encode("utf-8")).hexdigest()
        if h == self.state.d["queue_hash"] and self.queue_file.exists():
            self.retry_queue_written()
            return
        self.queue_file.parent.mkdir(parents=True, exist_ok=True)
        atomic_local_text(self.queue_file, body)
        self.state.d["queue_hash"] = h
        queued = [e["id"] for e in entries if e.get("status") == "queued"]
        if queued:
            pending = sorted(set(queued))
            self.state.d["queue_written_pending"] = pending
            self.state.d["queue_written_original"] = self._freeze_original("/queue/written", {"ids": pending, "officer": self.officer_id}, "queue written")
        try:
            self.state.save()  # file hash, IDs and actual original officer/body are one custody save
        except OSError as error:
            self._custody_halted = True
            self._state_write_failed("queue-reservation", error)
            raise NoCustody("queue file written but acknowledgment custody could not be persisted")
        log(f"queue file written: {len(entries)} entries ({len(queued)} new) — the addon reads it at the next /reload (the panel's Sync & reload)")
        if queued:
            self.retry_queue_written()

    def valid_launch_control(self, db: dict[str, Any]) -> dict[str, Any] | None:
        if not self.membership_only or self._custody_halted:
            return None
        roster = db.get("roster")
        control = db.get("launchControl")
        at = int(time.time())
        if not isinstance(roster, dict):
            return None
        own = saved_character(db)
        if (not own or codes.normalize_character(own) != codes.normalize_character(self.officer)
                or not isinstance(roster.get("exportedAt"), (int, float)) or not 0 <= at-roster["exportedAt"] <= 600
                or not launch_operations229.validate_control(self.secret, control, at, db.get("lastCharacterGuid"), roster.get("nativeGuild"), roster.get("nativeRealm"))):
            return None
        return control

    def read_launch_control(self, db: dict[str, Any]) -> None:
        control = self.valid_launch_control(db)
        if control is None:
            return
        key = "launch-control:" + control["guid"] + ":" + control["id"]
        if self.state.was_seen(key):
            return
        # Spend the explicit local request before its first read. Restart never resumes a role scan.
        self.state.seen(key)
        self.state.save()
        if control['action'] == 'scan':
            roster = db['roster']
            accepted = self._launch_accepted_roster
            if (accepted is None or accepted['exportedAt'] != roster.get('exportedAt')
                    or accepted['exportedAt'] != self.state.d['roster_sent']
                    or accepted['digest'] != launch_operations229.complete_roster_digest(roster)):
                self.launch_scan._stop('native-roster-receipt-required')
                self.launch_scan.control_id = control['id']
                self.write_launch_operations()
                return
        if self.launch_scan.request(control, time.time()):
            if control['action'] == 'scan':
                self.launch_scan.expected_snapshot = (accepted['snapshot'],accepted['exportedAt'])
            self.write_launch_operations()

    def write_launch_operations(self) -> None:
        body = launch_operations229.render_pages(self.launch_scan.result(), int(time.time()))
        if body is None:
            log("launch projection validation held; previous page dates remain unchanged")
            return
        path = self.launch_operations_file
        if not path.parent.is_dir() or path.is_symlink() or path.with_suffix(".tmp").is_symlink():
            log("launch operation projection path unavailable; no queue file written")
            return
        atomic_local_text(path, body)
        result = self.launch_scan.result()
        fresh = sum(int(time.time()) < page['expiresAt'] and int(time.time()) < page['scan']['expiresAt'] for page in result['pages'])
        log(f"launch projection: {result['discoveredPages']}/50 pages; discovery {'complete' if result['scanComplete'] else 'incomplete'}; {fresh} action-fresh page(s); {result['stoppedReason'] or self.launch_scan.phase}; reload to load")

    def pull_launch_operations(self) -> None:
        if not self.membership_only or self._custody_halted:
            return
        # One explicit scan page per >=5 seconds, between the ordinary ingestion passes.
        if self.launch_scan.step(self.worker.call, time.time()):
            self.write_launch_operations()

    def pull_strict_display(self) -> None:
        if not self.membership_only or self._custody_halted:
            return
        at = int(time.time())
        if at < self._next_strict_display_pull:
            return
        cadence = min(1800, max(300, self.unverified_poll))
        self._next_strict_display_pull = at + 300
        ok, response = self.worker.call("GET", STRICT_DISPLAY_PATH, retries=1)
        body = self.render_strict_display(response, int(time.time())) if ok else None
        if body is None:
            log("strict roster display unavailable; any previous lists keep their original dates")
            return
        path = self.strict_display_file
        if not path.parent.is_dir() or path.is_symlink() or path.with_suffix(".tmp").is_symlink():
            log("strict roster display file unavailable; invitation queue untouched")
            return
        atomic_local_text(path, body)
        self._next_strict_display_pull = at + cadence

    @staticmethod
    def render_strict_display(report: Any, at: int) -> str | None:
        def text(value: Any, limit: int) -> bool:
            return isinstance(value, str) and 0 < len(value.encode("utf-8", errors="surrogatepass")) <= limit and not re.search(r"[\x00-\x1f\x7f\ud800-\udfff]", value)

        if not isinstance(report, dict):
            return None
        protocol = report.get("protocol")
        if protocol not in ("launch-roster-display-v1", STRICT_DISPLAY_PROTOCOL):
            return None
        v2 = protocol == STRICT_DISPLAY_PROTOCOL
        keys = {"protocol", "fetchedAt", "snapshotAt", "guild", "realm", "verified", "unverified"}
        if v2:
            keys.add("unknown")
        if set(report) != keys:
            return None
        fetched, snapshot = report["fetchedAt"], report["snapshotAt"]
        if (type(fetched) is not int or type(snapshot) is not int
                or abs(at - fetched) > 60 or not 0 < snapshot <= fetched <= snapshot + 3600
                or not text(report["guild"], 128) or not text(report["realm"], 128)):
            return None
        verified, unverified, unknown = report["verified"], report["unverified"], report.get("unknown", [])
        if (not isinstance(verified, list) or not isinstance(unverified, list) or not isinstance(unknown, list)
                or len(verified) + len(unverified) + len(unknown) > 1000):
            return None
        guids: set[str] = set()
        lines = [
            "-- Generated strict roster display only. Do not edit. No invite/removal custody.",
            f"OlympusVerifyLists = {{ version = {2 if v2 else 1},",
            f"  guild = {json.dumps(report['guild'], ensure_ascii=False)},",
            f"  realm = {json.dumps(report['realm'], ensure_ascii=False)},",
        ]
        sections = [("verified", verified), ("unverified", unverified)]
        if v2:
            sections.append(("unknown", unknown))
        for label, members in sections:
            fields = ("status", "username", "displayName") if label == "verified" else ("pending",) if label == "unverified" else ("reason",)
            lines.append(f"  {label} = {{ fetchedAt = {fetched}, snapshotAt = {snapshot}, members = {{")
            for row in members:
                if not isinstance(row, dict) or set(row) != {"name", "guid", *fields}:
                    return None
                name, guid = row["name"], row["guid"]
                if not text(name, 100) or "|" in name or not text(guid, 40) or not re.fullmatch(r"Player-[0-9]+-[0-9a-fA-F]+", guid) or guid in guids:
                    return None
                guids.add(guid)
                if label == "verified":
                    if (row["status"] != "member"
                            or any(row[k] is not None and not text(row[k], 256) for k in ("username", "displayName"))):
                        return None
                elif label == "unverified" and type(row["pending"]) is not bool:
                    return None
                elif label == "unknown" and row["reason"] not in ("linked_before_cutoff", "link_review"):
                    return None
                values = [f"{key} = {json.dumps(row[key], ensure_ascii=False)}" for key in ("name", "guid", *fields) if row[key] is not None]
                lines.append("    { " + ", ".join(values) + " },")
            lines.append("  } },")
        return "\n".join([*lines, "}", ""])

    def retry_queue_written(self) -> Delivery:
        """Only the captured acknowledgment may be retried; bare legacy IDs are never assigned a new owner."""
        pending = self.state.d.get("queue_written_pending") or []
        original = self.state.d.get("queue_written_original")
        if not pending and original is None:
            return Delivery.DELIVERED
        if (not self._retained_original(original) or original["path"] != "/queue/written"
                or not isinstance(original["body"], dict) or original["body"].get("ids") != pending):
            self._warn_custody("legacy, changed or different-owner queue acknowledgment requires attended recovery")
            return Delivery.HELD
        return self._dispatch_original(original, retries=1, settle=self._settle_written_original)

    def _settle_written_original(self, original: dict[str, Any]) -> Delivery:
        pending = self.state.d["queue_written_pending"]
        self.state.d["queue_written_pending"] = []
        self.state.d["queue_written_original"] = None
        try:
            self.state.save()
        except OSError as error:
            self.state.d["queue_written_pending"] = pending
            self.state.d["queue_written_original"] = original
            self._custody_halted = True
            self._ack_settlement_pending = ("queue-written", original) if original.get("acknowledged") is True else None
            self._state_write_failed("queue-settlement", error)
            self._warn_custody("queue acknowledgment settlement could not be persisted; original retained")
            return Delivery.HELD
        return Delivery.DELIVERED

    @staticmethod
    def render_queue(entries: list[dict[str, Any]], set_note: bool, unverified: dict[str, Any] | None = None, intake_receipts: list[dict[str, Any]] | None = None, verification_results: list[dict[str, Any]] | None = None) -> str:
        def q(s: Any) -> str:
            # Lua short strings cannot contain a raw newline OR carriage return; an unescaped \r made the whole
            # generated file a syntax error, which silently stopped every Discord approval from reaching the addon.
            out = str(s).replace("\\", "\\\\").replace('"', '\\"')
            for ch, esc in (("\n", "\\n"), ("\r", "\\r"), ("\t", "\\t")):
                out = out.replace(ch, esc)
            return '"' + "".join(c if ord(c) >= 32 else "" for c in out) + '"'

        lines = [
            "-- Generated by the olympus-verify watcher. Do not edit; loaded by the OlympusVerify addon at login or /reload.",
            "OlympusQueue = {",
            "  version = 1,",
            f"  generatedAt = {int(time.time())},",
            f"  setGuildNote = {'true' if set_note else 'false'},",
            "  entries = {",
        ]
        for e in entries:
            try:
                eid = int(e["id"])
            except (KeyError, TypeError, ValueError):
                log(f"queue entry without a usable id, skipped: {e!r}")
                continue
            # Place in the global line, as the Worker counts it. 0 means "this Worker does not send it yet", which
            # the addon renders as no number rather than as position zero -- the watcher and the Worker are deployed
            # separately, so one of them is always briefly older than the other.
            try:
                pos = int(e.get("position") or 0)
            except (TypeError, ValueError):
                pos = 0
            # Worker .41: 1 = a reserved name the guild site put at the top of the queue. The addon sends these first
            # and marks them; 0 (or an older Worker that does not send it) is an ordinary entry.
            try:
                prio = max(0, int(e.get("priority") or 0))
            except (TypeError, ValueError):
                prio = 0
            lines.append(
                f"    {{ id = {eid}, character = {q(e.get('character') or '')}, discordId = {q(e.get('discordId') or '')}, "
                f"note = {q(e.get('note') or '')}, position = {pos}, lastReason = {q(e.get('lastReason') or '')}, priority = {prio} }},"
            )
        lines.append("  },")
        if unverified:
            def num(v: Any) -> str:
                # nil for unknown, never 0: an eligibleAt of 0 would read as "removable since 1970"
                try:
                    return str(int(v)) if v is not None else "nil"
                except (TypeError, ValueError):
                    return "nil"
            lines += [
                "  unverified = {",
                f"    fetchedAt = {int(time.time())},",
                f"    snapshotAt = {num(unverified.get('snapshotAt'))},",
                f"    graceDays = {num(unverified.get('graceDays'))},",
                f"    verifyOpenSince = {num(unverified.get('verifyOpenSince'))},",
                f"    firstSeenAvailable = {'true' if unverified.get('firstSeenAvailable') else 'false'},",
                f"    openTickets = {num(unverified.get('openTickets') or 0)},",
                "    ranks = {",
            ]
            for r in unverified.get("ranks") or []:
                lines.append(
                    f"      {{ rank = {q(r.get('rank') or '')}, rankIndex = {num(r.get('rankIndex'))}, "
                    f"total = {num(r.get('total'))}, unverified = {num(r.get('unverified'))} }},"
                )
            lines += ["    },", "    members = {"]
            for m in unverified.get("members") or []:
                lines.append(
                    f"      {{ name = {q(m.get('name') or '')}, rank = {q(m.get('rank') or '')}, rankIndex = {num(m.get('rankIndex'))}, "
                    f"level = {num(m.get('level'))}, firstSeen = {num(m.get('firstSeen'))}, eligibleAt = {num(m.get('eligibleAt'))}, "
                    f"pending = {'true' if m.get('pending') else 'false'} }},"
                )
            lines += ["    },", "  },"]
            # Worker .41: who on the roster has linked Discord, with the names the officers' roster window shows.
            verified = unverified.get("verified")
            if isinstance(verified, list):
                lines += ["  verified = {", f"    fetchedAt = {int(time.time())},", "    members = {"]
                for m in verified:
                    lines.append(
                        f"      {{ name = {q(m.get('name') or '')}, guid = {q(m.get('guid') or '')}, status = {q(m.get('status') or '')}, "
                        f"discordId = {q(m.get('discordId') or '')}, username = {q(m.get('username') or '')}, displayName = {q(m.get('displayName') or '')} }},"
                    )
                lines += ["    },", "  },"]
        lines += ["  intakeReceipts242 = {"]
        for r in intake_receipts or []:
            fields = ", ".join(k + " = " + (str(r[k]) if k in ("observedAt", "expiresAt") else q(r.get(k) or "")) for k in ("id", "status", "guid", "character", "discordRole", "observedAt", "expiresAt", "mac"))
            lines.append("    { " + fields + " },")
        lines.append("  },")
        lines += ["  verificationResults242 = {"]
        for r in verification_results or []:
            fields = ", ".join(k + " = " + (str(r[k]) if k in ("observedAt", "expiresAt") else q(r.get(k) or "")) for k in ("guid", "character", "status", "discordRole", "observedAt", "expiresAt", "mac"))
            lines.append("    { " + fields + " },")
        lines.append("  },")
        lines += ["}", ""]
        return "\n".join(lines)

    # ---------- main ----------
    def check(self) -> int:
        self.require_launch_worker()
        ok = True
        for label, p in (("chat log", self.chat_log), ("SavedVariables", self.sv_file), ("addon folder", self.queue_file.parent)):
            exists = p.is_file() if self.membership_only and label == "SavedVariables" else p.exists()
            required = label == "addon folder" or self.membership_only and label == "SavedVariables"
            missing = "MISSING — install the addon first" if label == "addon folder" else (
                "MISSING — log into the selected client/account and /reload" if required else "MISSING (created by WoW on first use)")
            log(f"{label}: {p} {'OK' if exists else missing}")
            ok &= exists or not required
        queue_path = "/queue?presenceOnly=1" if self.membership_only else "/queue"
        reachable, res = self.worker.call("GET", queue_path, retries=1)
        paused = res if isinstance(res, dict) and (res.get("paused") or res.get("configurationError") or res.get("httpStatus") in (401, 403, 429)) else None
        queue_ready = reachable and not paused and isinstance(res, dict) and isinstance(res.get("entries"), list)
        if self.membership_only:
            queue_ready = queue_ready and res.get("presenceOnly") is True
        if paused:
            # 0.6.5: a pause is reported as one, with its cause, instead of a bare FAILED
            until = datetime.fromtimestamp(time.time() + int(paused.get("retryAfterSeconds") or 0)).strftime("%d %b %H:%M")
            log(f"worker: {self.worker.base} PAUSED until {until} after http {paused.get('httpStatus')}"
                + (" — a redirect: worker_url must be the Worker's own HTTPS origin" if paused.get("configurationError") else " — check watcher_token" if paused.get("httpStatus") in (401, 403) else " — rate limited"))
        else:
            log(f"worker: {self.worker.base} {'OK' if queue_ready else 'FAILED (url/token/queue response?)'}")
        # Worker.call deliberately treats a terminal4xx as a delivery receipt for POSTs.
        # A diagnostic GET needs an actual queue object, not that transport-level boolean.
        ok &= bool(queue_ready)
        if queue_ready and not self.membership_only:
            got, u = self.worker.call("GET", "/queue/unverified", retries=1)
            if got and isinstance(u, dict) and isinstance(u.get("members"), list):
                log(f"unverified list: {len(u['members'])} not verified, {len(u.get('verified') or [])} verified with Discord names (build {u.get('build', '?')})"
                    + ("" if u.get("firstSeenAvailable") else " — first-seen dates MISSING: apply migrations/2026-09-25-first-seen.sql"))
            else:
                log("unverified list: not served by this Worker build (deploy .34)")
        # Deliberately not printed: the code itself is a live credential for two UTC days, and --check output ends up
        # in screenshots, scrollback and scheduled-task logs. A digest is enough to compare two installs.
        today = codes.valid_codes(self.secret, self.officer or "Test")[0]
        digest = hashlib.sha256(today.encode("utf-8")).hexdigest()[:8]
        log(f"code check: secret loaded; today's code for {self.officer or 'Test'} hashes to {digest} (not the code itself)")
        log(f"queue identity: {self.officer_id or '(none — this watcher claims nothing, fine for a single officer)'}")
        pending = len(self.state.d.get("outbox") or [])
        log(f"outbox: {pending} buffered post(s) waiting for the Worker" if pending else "outbox: empty")
        log(f"chat-log lag: {self.lag_summary()}")
        for d in (self.state.d.get("diag") or [])[-8:]:
            if isinstance(d, dict):
                log(f"diag: '{d.get('tag')}' reached {d.get('file')} {d.get('lag')}s after it was written ({datetime.fromtimestamp(d.get('seenAt') or 0).strftime('%d %b %H:%M')})")
        on = self.officer_online() if self.report_presence else None
        r = self.state.d.get("relay") or {}
        log(f"relay: {self.relay_character() or '(no officer_character)'} — " + ("in the world" if on else "not in the world" if on is False else "cannot tell (presence not reported)")
            + (f"; addon {r.get('addon')} said so {datetime.fromtimestamp(r.get('at') or 0).strftime('%d %b %H:%M')}" if r.get("addon") else "; no login note from the addon yet (/reload once)"))
        if queue_ready:
            got, h = self.worker.call("GET", "/health", retries=1)
            rel = (h or {}).get("relays") if got and isinstance(h, dict) else None
            if isinstance(rel, dict) and "requestCodes" in rel:
                log("request codes: " + ("on — Get my code hands them out" if rel.get("requestCodes") else "waiting — the button asks for a character name until an addon 0.6.0+ has checked in"))
        return 0 if ok else 1

    def _optional_role_wake264(self, cache: Any) -> None:
        if (not self.membership_only or getattr(self.worker, 'membership_only', False) is not True
                or self._custody_halted or self.worker.paused()
                or self._role_wake_startup264 != self._delivery_binding()
                or not isinstance(cache, dict) or cache.get("presenceOnly") is not True
                or cache.get("independentRoleWake264") is not True):
            return
        at = time.monotonic()
        if not math.isfinite(at) or self._last_role_wake264 is not None and at - self._last_role_wake264 < 30:
            return
        self._last_role_wake264 = at  # one attempt, including an unknown/refused result; no immediate retry
        try:
            if self.worker.wake_sweep264(self.secret):
                log("role sweep wake: scheduling acknowledged; no role outcome observed")
        except OSError as error:
            self._custody_halted = True
            self._state_write_failed("optional-sweep-pause", error)

    def require_launch_worker(self) -> None:
        self._role_wake_startup264 = None
        if not self.membership_only:
            return
        okay, response = self.worker.call("GET", "/health", retries=1)
        state = response.get("verification") if okay and isinstance(response, dict) and response.get("ok") is True else None
        if not isinstance(state, dict) or state.get("mode") != "members-only" or state.get("nativeScopePinned") is not True or type(state.get("nativeMembershipProofVersion")) is not int or state["nativeMembershipProofVersion"] != 1:
            raise LaunchNotReady("launch verification Worker/profile is not ready; ingestion was not started")
        build = re.fullmatch(r"\d{4}-\d{2}-\d{2}\.(\d{1,6})(?: .*)?", response.get("build", "")) if isinstance(response.get("build"), str) else None
        if build is not None and int(build[1]) >= 264:
            self._role_wake_startup264 = self._delivery_binding()

    def run(self) -> None:
        self.require_launch_worker()
        log(f"watcher {WATCHER_VERSION}: watching {self.chat_log} and {self.sv_file}")
        while True:
            try:
                self.recover_local_settlement()
                self._require_custody_continuation()
                if self.membership_only:
                    self.check_savedvars()
                self.flush_outbox()
                self._require_custody_continuation()
                self.tail_chat_log()
                if not self.membership_only:
                    self.check_savedvars()
                self.pull_queue()
                self.pull_launch_operations()
                self.scan_diag_logs()
                if time.time() - self._last_lag_report > 1800 and self.state.d.get("lag"):
                    self._last_lag_report = time.time()
                    log(f"chat-log lag: {self.lag_summary()}")
            except Exception as e:  # ordinary loop errors retry; uncertain local custody exits below
                self._require_custody_continuation()
                log(f"loop error: {type(e).__name__}")
            time.sleep(self.poll)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="config.json")
    ap.add_argument("--check", action="store_true", help="validate configuration and exit")
    ap.add_argument("--membership-only", action="store_true", help="require the strict native-membership profile without changing configuration")
    ap.add_argument("--wow-dir", help="select an existing absolute WoW client directory without changing configuration")
    a = ap.parse_args()
    # 0.6.9: a missing, unreadable or malformed config.json is a message and exit 2, never a traceback.
    try:
        with open(a.config, encoding="utf-8-sig") as f:
            cfg = json.load(f)
    except FileNotFoundError:
        log(f"config: {a.config} not found; copy config.example.json to config.json and fill it in")
        return 2
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as e:
        log(f"config: {a.config} could not be read as JSON ({type(e).__name__}); fix the file and start again")
        return 2
    if not isinstance(cfg, dict):
        log("config: config.json must be a JSON object (see config.example.json)")
        return 2
    if a.wow_dir is not None:
        try:
            wow_dir = Path(a.wow_dir)
            usable = bool(a.wow_dir.strip()) and wow_dir.is_absolute() and wow_dir.is_dir()
        except (OSError, ValueError):
            usable = False
        if not usable:
            log("config: --wow-dir must name an existing absolute directory")
            return 2
        cfg = {**cfg, "wow_dir": str(wow_dir)}
    missing = [k for k in ("worker_url", "watcher_token", "verify_secret", "wow_dir", "account") if k not in cfg]
    if missing:
        log("config: missing " + ", ".join(missing) + " (see config.example.json)")
        return 2
    if a.membership_only:
        # Positive-only launch admission. Keep credentials, state location and the private file unchanged.
        cfg = {**cfg, "membership_only": True}
    try:
        # Acquire before Watcher construction, which can persist trusted_keys_since.
        # The offline recovery command uses this same cooperating-writer lease.
        with StateLease(Path(cfg.get("state_file", "watcher-state.json"))):
            w = Watcher(cfg)
            log(f"watcher {WATCHER_VERSION}: mode {'members-only' if w.membership_only else 'legacy'}"
                + (" (required by --membership-only)" if a.membership_only else ""))
            if a.wow_dir is not None:
                log("WoW source directory selected by --wow-dir; private configuration unchanged")
            if a.check:
                return w.check()
            w.run()
            return 0
    except FileExistsError:
        log("state already has a writer/recovery lease; stop and inspect before continuing")
        return 2
    except CustodyStopped:
        log("local custody persistence stopped; inspect storage and restart with the same state and configuration")
        return 2
    except LaunchNotReady:
        log("launch verification Worker/profile is not ready; no ingestion started. Configure the reviewed live native scope before starting this collector.")
        return 3
    except ValueError as e:  # invalid configuration/state remains refused before dispatch
        log(f"config: {e}")
        return 2


if __name__ == "__main__":
    sys.exit(main())

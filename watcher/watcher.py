#!/usr/bin/env python3
"""olympus-verify watcher — runs on the officer's PC next to the WoW client. Standard library only.

What it does, forever, politely:
  1. tails Logs/WoWChatLog.txt and forwards valid `!verify CODE` whispers to the Worker (the fast path — the client
     writes that file in 48 KiB batches; the addon forces a write after each whisper and each guild join or departure,
     and the lag this watcher measures on every line says whether that works — see --check)
  2. re-reads the addon's SavedVariables after every /reload or logout: mail codes, invite/joined/note events, the roster export
  3. pulls the invite queue from the Worker and writes Interface/AddOns/OlympusVerify/OlympusQueue.lua
     (the addon reads it at the next login or /reload and fires the invites on the officer's key press)
  4. tells the Worker, on that same poll, whether this officer's game client is in the world, so /verify names an
     officer who can actually receive the whisper

It never touches the game client, never sends input, never keeps the client awake. It reads files WoW writes and
writes one data file WoW reads at load time — the same contract every addon-companion app uses.

    python watcher.py --config config.json            run
    python watcher.py --config config.json --check    validate paths and the Worker token, then exit
"""
from __future__ import annotations

import argparse
import hashlib
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
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import codes  # noqa: E402
import savedvars  # noqa: E402

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

WATCHER_VERSION = "0.6.6"


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
    print(f"{datetime.now().strftime('%H:%M:%S')} {msg}", flush=True)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Never follow a redirect: it would carry the bearer token to another host, or turn a signed POST into a GET.
    A redirect from the Worker's origin is a configuration error (the wrong worker_url) and is reported as one (0.6.5)."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


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
    KNOWN_RESULTS = frozenset({"verified", "resumed", "no_pending", "bound_elsewhere", "member", "banned", "invalid"})  # exactly ingest.ts's words

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
        self.token = token
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
                return f" ({r})"
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
        paused = self.paused()
        if paused:
            return False, paused
        # 0.6.6: the bearer goes to the configured origin only: the path must be local and absolute (Codex 03:07; a path
        # without its leading slash would have changed the hostname by concatenation)
        if not isinstance(path, str) or not path.startswith("/") or path.startswith("//") or "://" in path or any(ord(c) <= 32 or ord(c) == 127 for c in path):
            log(f"worker {method}: refused a request path that is not local to the origin")
            return False, "invalid_path"
        data = None if body is None else json.dumps(body).encode("utf-8")
        req = urllib.request.Request(self.base + path, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self.token}")
        req.add_header("Content-Type", "application/json")
        req.add_header("User-Agent", f"olympus-verify-watcher/{WATCHER_VERSION}")
        delay = 2
        for attempt in range(retries):
            try:
                with self.opener.open(req, timeout=20) as res:
                    try:
                        raw = res.read().decode("utf-8")
                        result = json.loads(raw) if raw.strip() else None
                    except (UnicodeDecodeError, ValueError, RecursionError):
                        log(f"worker {method} {path} -> a response that is not JSON; not treated as delivered")
                        return False, "invalid_response"
                    if not isinstance(result, dict):
                        # 0.6.6: the Worker acknowledges with a JSON object; an empty or other 2xx is not a delivery
                        # (Codex 03:07: an empty 2xx was True/None and post() dropped the event as delivered)
                        log(f"worker {method} {path} -> {getattr(res, 'status', '2xx')} without a JSON acknowledgment; not treated as delivered")
                        return False, "invalid_response"
                    pause = self._pause_data()
                    if pause.get("worker_retry_status") is not None:
                        pause["worker_retry_status"] = None
                        self._save_pause()
                    return True, result
            except urllib.error.HTTPError as e:
                code = e.code
                if 300 <= code < 400:
                    self._pause_for(code, self.PAUSE_REDIRECT, f"worker {method} {path} -> {code} redirect refused; worker_url must be the Worker's own HTTPS origin; all requests paused for 15 minutes")
                    return False, {"httpStatus": code, "retryAfterSeconds": self.PAUSE_REDIRECT, "configurationError": True}
                if code in (401, 403, 429):
                    seconds = max(self.PAUSE_AUTH if code in (401, 403) else self.PAUSE_RATE, self._retry_after(e.headers)) + random.uniform(0, 1)
                    self._pause_for(code, seconds, f"worker {method} {path} -> {code} " + ("(check watcher_token); all requests paused for at least 15 minutes" if code in (401, 403) else "rate limited; all requests paused until the Worker's deadline"))
                    return False, {"httpStatus": code, "retryAfterSeconds": math.ceil(float(self._pause_data()["worker_retry_at"]) - time.time())}
                if 400 <= code < 500:
                    # the Worker understood and rejected it; retrying will not change the answer. Its body is not logged.
                    log(f"worker {method} {path} -> {code}")
                    return True, None
                log(f"worker {method} {path} -> {code}, retry {attempt + 1}/{retries}")
            except (urllib.error.URLError, TimeoutError, OSError, http.client.HTTPException) as e:
                # the exception's class only: its text can carry response bytes (0.6.6, Codex 03:07)
                log(f"worker {method} {path} unreachable ({type(e).__name__}), retry {attempt + 1}/{retries}")
            time.sleep(delay)
            delay *= 2
        return False, "unreachable"


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
                self.d.update(json.loads(path.read_text(encoding="utf-8")))
            except Exception:
                log("state file unreadable, starting fresh")

    def save(self) -> None:
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.d), encoding="utf-8")
        os.replace(tmp, self.path)

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
        self.worker = Worker(cfg["worker_url"], cfg["watcher_token"])
        self.secret = cfg["verify_secret"]
        self.officer = cfg.get("officer_character", "")
        # Identity used to claim invites, so two officers running the addon do not both invite the same applicant.
        # Defaults to the officer character, normalized, which is unique per officer and needs no extra configuration.
        self.officer_id = str(cfg.get("officer_id") or codes.normalize_character(self.officer) or "").strip()[:64]
        self.state = State(Path(cfg.get("state_file", "watcher-state.json")))
        self.worker.pause_state = self.state  # 0.6.5: the transport pause is kept with the rest of the state
        self.poll = float(cfg.get("poll_seconds", 2))
        self.queue_poll = float(cfg.get("queue_poll_seconds", 30))
        self._last_queue_pull = 0.0
        # Who is in the guild but not verified. Slow on purpose: the addon reads the queue file only at login or
        # /reload, so fetching this more often than a person reloads buys nothing and costs D1 reads (the free tier
        # ran out of writes once already, on 18 Sep). A roster upload forces the next fetch, since that is when it moves.
        self.unverified_poll = float(cfg.get("unverified_poll_seconds", 1800))
        self._last_unverified_pull = 0.0
        self._unverified: dict[str, Any] | None = None
        self.max_outbox = int(cfg.get("max_outbox", 500))
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
    def post(self, path: str, body: Any, label: str) -> bool:
        """Deliver now, or keep it for later. Never silently drop: an event that is not acknowledged is queued in the
        state file and retried on every poll, so a Worker outage or a bad token costs latency, not verifications."""
        ok, res = self.worker.call("POST", path, body)
        if ok:
            log(f"  -> delivered{Worker.summarize(res)}")  # 0.6.6: a fixed summary, never the body
            return True
        if len(self.state.d["outbox"]) >= self.max_outbox:
            log(f"outbox full ({self.max_outbox}); dropping the oldest entry to keep the newest")
            self.state.d["outbox"].pop(0)
        self.state.d["outbox"].append({"path": path, "body": body, "label": label, "at": int(time.time())})
        log(f"  -> not delivered ({res}); buffered, {len(self.state.d['outbox'])} waiting")
        self.state.save()
        return False

    def flush_outbox(self) -> None:
        """Retry buffered posts oldest first, stopping at the first failure so ordering is preserved."""
        box = self.state.d["outbox"]
        if not box:
            return
        sent = 0
        while box:
            item = box[0]
            ok, res = self.worker.call("POST", item["path"], item["body"], retries=1)
            if not ok:
                break
            box.pop(0)
            sent += 1
        if sent:
            log(f"outbox: delivered {sent} buffered post(s), {len(box)} left")
            self.state.save()

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
        lines = [raw.strip("\r\n\ufeff") for raw in chunk.decode("utf-8", errors="replace").splitlines()]
        # The addon writes its identity note right after the whisper it confirms, and both reach the file in one flush:
        # read the notes first, so the verification relayed from the whisper line can carry the character's GUID.
        for line in lines:
            if "ref OLVg-" in line:
                self.read_identity(line)
        for line in lines:
            self.handle_chat_line(line)
        self.state.d["chat_offset"] = off + consumed
        self.state.d["chat_size"] = size
        if fp:
            self.state.d["chat_fp"] = fp
        self.state.save()

    def handle_chat_line(self, line: str) -> None:
        if "OLVDIAG" in line and OUT_WHISPER_RE.match(line):
            # only the officer's own outgoing lines: anyone can whisper or emote the word
            self.note_diag_line(line)
        if self.handle_signed_join(line) or self.handle_signed_leave(line) or self.handle_signed_relay(line) or self.handle_signed_identity(line):
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
            log(f"whisper from {sender}: '{v.group('code')[:12]}' is not a code (not forwarded)")
            return
        self.note_lag("whisper", line)
        # Checked before it is marked seen: a code this PC's clock cannot accept yet (just after midnight UTC on a slow
        # clock) must still go through when it is whispered again, not be remembered as done.
        kind = codes.code_kind(self.secret, sender, code)
        if not kind:
            log(f"whisper from {sender}: invalid/expired code {code} (not forwarded)")
            return
        key = self.code_key("w", sender, code)
        if self.state.seen(key):
            self.note_ticket_reuse(sender, code)
            return
        self.note_ticket_sender(sender, code)
        body = {"character": sender, "code": code, "source": "whisper", "ts": int(time.time()), "officer": self.officer}
        guid = self.identity_of(sender)
        if guid:
            body["guid"] = guid
        log(f"whisper from {sender}: valid {'request ' if kind == 'ticket' else ''}code, forwarding{' (character ID known)' if guid else ''}")
        self.post("/ingest/verify", body, f"verify {sender}")
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
        """How long after the client wrote this line (its own timestamp) this watcher read it. Seconds mean the addon's
        flush works; minutes mean lines wait for the client's 48 KiB batch. Backlog after a restart is not counted."""
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
                f"{fast} within 10s ({'the flush works' if fast >= max(1, len(lags) * 0.8) else 'lines are waiting for the 48 KiB batch'})")

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
        if self.state.seen(key):
            return True
        self.note_lag("signed", line)
        log(f"guild: {name} joined (addon-signed); forwarding")
        self.post("/ingest/events", {"events": [{"type": "joined", "name": name, "ts": int(time.time()), "ok": True, "origin": "token", "detail": "addon-confirmed"}]}, f"joined {name}")
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
        if self.state.seen(key):
            return True
        self.note_lag("signed", line)
        if kind in ("space", "unverified"):
            ev = {"type": "removed", "reason": kind, "detail": "freed a seat (addon-signed)" if kind == "space" else "not verified (addon-signed)"}
        else:
            ev = {"type": "left", "detail": "left the guild (addon-signed)" if kind == "left" else "removed from the guild (addon-signed)"}
        ev.update({"name": name, "ts": int(time.time()), "ok": True, "origin": "token"})
        log(f"guild: {name} — {ev['detail']}; forwarding")
        self.post("/ingest/events", {"events": [ev]}, f"{ev['type']} {name}")
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
        if self.state.seen(key):
            return True
        self.post("/ingest/events", {"events": [{"type": "identity", "name": name, "guid": guid, "ts": int(time.time()), "ok": True, "origin": "token"}]}, f"identity {name}")
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
        """Guild joins and departures from the chat log: the Worker grants/strips the role at once instead of waiting
        for the next roster export (which still reconciles everything on the officer's next /reload)."""
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
        if self.state.seen(key):
            return
        self.note_lag("system", line)
        ev["ts"] = int(time.time())
        ev["ok"] = True
        ev["origin"] = "chatlog"  # forgeable with /emote: the Worker will not grant or remove a role on this alone
        log(f"guild: {ev['name']} — {ev['detail']} (chat log, unverified); forwarding")
        self.post("/ingest/events", {"events": [ev]}, f"{ev['type']} {ev['name']}")
        self.state.save()

    # ---------- 2. SavedVariables ----------
    def check_savedvars(self) -> None:
        if not self.sv_file.exists():
            return
        mtime = self.sv_file.stat().st_mtime
        if mtime <= self.state.d["sv_mtime"]:
            return
        time.sleep(1.0)  # WoW writes the file in one go, but give it a moment
        try:
            data = savedvars.parse_file(str(self.sv_file))
        except Exception as e:
            log(f"SavedVariables parse failed: {e}")
            self.state.d["sv_mtime"] = mtime
            self.state.save()
            return
        db = data.get("OlympusVerifyDB") or {}
        self.state.d["sv_mtime"] = mtime
        self.note_saved_relay(db, mtime)
        self.forward_events(db.get("events") or [])
        self.forward_roster(db.get("roster") or {})
        self.state.save()

    def forward_events(self, events: list[dict[str, Any]]) -> None:
        relay: list[dict[str, Any]] = []
        stale = 0
        for e in events:
            if not isinstance(e, dict):
                continue
            t, name, ts = e.get("type"), e.get("name") or "", int(e.get("ts") or 0)
            if t in ("whisper", "mail") and e.get("ok") and e.get("code"):
                raw = str(e["code"]).upper()
                strict = codes.strict_code(raw)
                # the same key the chat-log path used for this whisper, so it is relayed once whichever route is first
                key = self.code_key(t, name, strict) if strict else f"{t[0]}:{codes.normalize_character(name)}:{raw}"
                if not codes.code_kind(self.secret, name, raw):
                    continue
                if self.state.seen(key):
                    continue
                if strict:
                    self.note_ticket_sender(name, strict)
                body = {"character": name, "code": strict or raw, "source": t, "ts": ts, "officer": self.officer}
                if codes.is_guid(e.get("guid")):
                    body["guid"] = e["guid"]  # the addon read it from the whisper event itself
                log(f"{t} from {name} (SavedVariables): forwarding")
                self.post("/ingest/verify", body, f"verify {name}")
            elif t == "guild_full":
                # No character of its own: key it on the minute so a burst of refused invites reports once.
                key = f"gf:{ts // 60}"
                if self.state.seen(key):
                    continue
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
                if self.state.seen(key):
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
        if relay:
            self.post("/ingest/events", {"events": relay}, f"{len(relay)} addon event(s)")
        if stale and not getattr(self, "_stale_reported", False):
            self._stale_reported = True
            log(f"SavedVariables: {stale} join/departure event(s) older than {SV_EVENT_MAX_AGE // 3600} h not relayed (the roster export has settled them)")

    def forward_roster(self, roster: dict[str, Any]) -> None:
        exported = int(roster.get("exportedAt") or 0)
        members = roster.get("members") or []
        if not exported or exported <= self.state.d["roster_sent"] or not isinstance(members, list):
            return
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
        log(f"roster ({len(payload['members'])} members, exported {exported})")
        if self.post("/ingest/roster", payload, f"roster {exported}"):
            self.state.d["roster_sent"] = exported
            self._last_unverified_pull = 0.0  # the list is derived from the roster: refresh it on the next queue pull
        else:
            # buffered: the watermark still moves, because the outbox now owns delivery
            self.state.d["roster_sent"] = exported

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
        self.pull_unverified()
        path = "/queue" + (f"?officer={urllib.parse.quote(self.officer_id)}{self.presence_query()}" if self.officer_id else "")
        ok, res = self.worker.call("GET", path)
        if not ok or not res:
            return
        entries = res.get("entries") or []
        body = self.render_queue(entries, bool(res.get("setGuildNote")), self._unverified)
        # Hash the inputs, not the rendered file: generatedAt changes every second, so hashing the body meant the
        # comparison never matched and the queue file plus the state file were rewritten on every single poll.
        # The unverified list is an input too. Leaving it out would repeat the .24 trap, where new data changed and the
        # gate still said "unchanged", so the file never reached the addon.
        h = hashlib.sha256(json.dumps({"e": entries, "n": bool(res.get("setGuildNote")), "u": self._unverified}, sort_keys=True).encode("utf-8")).hexdigest()
        if h == self.state.d["queue_hash"] and self.queue_file.exists():
            self.retry_queue_written()
            return
        self.queue_file.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.queue_file.with_suffix(".tmp")
        tmp.write_text(body, encoding="utf-8")
        os.replace(tmp, self.queue_file)
        self.state.d["queue_hash"] = h
        self.state.save()
        queued = [e["id"] for e in entries if e.get("status") == "queued"]
        log(f"queue file written: {len(entries)} entries ({len(queued)} new) — the addon reads it at the next /reload (the panel's Sync & reload)")
        if queued:
            pending = sorted(set(self.state.d.get("queue_written_pending", [])) | set(queued))
            self.state.d["queue_written_pending"] = pending
            self.state.save()
            self.retry_queue_written()

    def retry_queue_written(self) -> None:
        """Tell the Worker which queue ids reached the file. Kept until acknowledged: without this the rows stay
        'queued' forever and the file is rewritten every poll."""
        pending = self.state.d.get("queue_written_pending") or []
        if not pending:
            return
        ok, _ = self.worker.call("POST", "/queue/written", {"ids": pending, "officer": self.officer_id}, retries=1)
        if ok:
            self.state.d["queue_written_pending"] = []
            self.state.save()

    @staticmethod
    def render_queue(entries: list[dict[str, Any]], set_note: bool, unverified: dict[str, Any] | None = None) -> str:
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
        lines += ["}", ""]
        return "\n".join(lines)

    # ---------- main ----------
    def check(self) -> int:
        ok = True
        for label, p in (("chat log", self.chat_log), ("SavedVariables", self.sv_file), ("addon folder", self.queue_file.parent)):
            exists = p.exists()
            log(f"{label}: {p} {'OK' if exists else 'MISSING (created by WoW on first use)' if label != 'addon folder' else 'MISSING — install the addon first'}")
            ok &= exists or label != "addon folder"
        reachable, res = self.worker.call("GET", "/queue", retries=1)
        paused = res if isinstance(res, dict) and (res.get("paused") or res.get("configurationError") or res.get("httpStatus") in (401, 403, 429)) else None
        if paused:
            # 0.6.5: a pause is reported as one, with its cause, instead of a bare FAILED
            until = datetime.fromtimestamp(time.time() + int(paused.get("retryAfterSeconds") or 0)).strftime("%d %b %H:%M")
            log(f"worker: {self.worker.base} PAUSED until {until} after http {paused.get('httpStatus')}"
                + (" — a redirect: worker_url must be the Worker's own HTTPS origin" if paused.get("configurationError") else " — check watcher_token" if paused.get("httpStatus") in (401, 403) else " — rate limited"))
        else:
            log(f"worker: {self.worker.base} {'OK' if reachable else 'FAILED (url/token?)'}")
        ok &= reachable
        if reachable:
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
        if reachable:
            got, h = self.worker.call("GET", "/health", retries=1)
            rel = (h or {}).get("relays") if got and isinstance(h, dict) else None
            if isinstance(rel, dict) and "requestCodes" in rel:
                log("request codes: " + ("on — Get my code hands them out" if rel.get("requestCodes") else "waiting — the button asks for a character name until an addon 0.6.0+ has checked in"))
        return 0 if ok else 1

    def run(self) -> None:
        log(f"watcher {WATCHER_VERSION}: watching {self.chat_log} and {self.sv_file}")
        while True:
            try:
                self.flush_outbox()
                self.tail_chat_log()
                self.check_savedvars()
                self.pull_queue()
                self.scan_diag_logs()
                if time.time() - self._last_lag_report > 1800 and self.state.d.get("lag"):
                    self._last_lag_report = time.time()
                    log(f"chat-log lag: {self.lag_summary()}")
            except Exception as e:  # never die
                log(f"loop error: {e!r}")
            time.sleep(self.poll)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="config.json")
    ap.add_argument("--check", action="store_true", help="validate configuration and exit")
    a = ap.parse_args()
    with open(a.config, encoding="utf-8") as f:
        cfg = json.load(f)
    try:
        w = Watcher(cfg)
    except ValueError as e:  # 0.6.5: a worker_url that is not a bare HTTPS origin is refused before any request
        log(f"config: {e}")
        return 2
    if a.check:
        return w.check()
    w.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Attended, fixed-scope Discord role removal. No Worker, D1 or verification writes.

The owner approved this operator workflow on 2026-10-28. A plan authorizes only
captured assignments; a journaled dispatch is never automatically sent again.
"""
from __future__ import annotations

import argparse
import contextlib
import csv
import getpass
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

GUILD_ID = "1549537348516188200"
SCOPE = "stockades-legacy-14"
ROLES = (
    ("1549581282227265566", "Guild Member"), ("1555039815395713136", "Veteran"),
    ("1549582112636665996", "Tank"), ("1549582122971562075", "Healer"),
    ("1549582133197017290", "DPS"), ("1549582202126344283", "Druid"),
    ("1549582423992574094", "Hunter"), ("1549582577575137340", "Mage"),
    ("1549582703442137251", "Paladin"), ("1549582829896208465", "Priest"),
    ("1549582894161199246", "Rogue"), ("1549583033198317678", "Shaman"),
    ("1549583125368279161", "Warlock"), ("1549583202744533022", "Warrior"),
)
ROLE_IDS = tuple(r[0] for r in ROLES)
ID = re.compile(r"[0-9]{17,20}\Z")
MAX_AGE = 1800
MAX_MEMBERS = 100000
MAX_PAIRS = 100000
MAX_RESPONSE = 8 * 1024 * 1024
STATES = ("pending", "dispatching", "acknowledged", "confirmed_absent", "observed_absent", "held", "unknown")
SENSITIVE_PERMISSIONS = 2 | 4 | 8 | 16 | 32 | (1 << 28) | (1 << 40)


class ResetError(Exception):
    pass


class APIError(ResetError):
    def __init__(self, status: int, retry_after: float = 0):
        self.status = status
        self.retry_after = retry_after
        super().__init__(f"Discord HTTP {status}; no mutation retry was made")


def canonical(value):
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def digest(value):
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def clock(at=None):
    return int(time.time()) if at is None else int(at)


def snowflake(value):
    return isinstance(value, str) and ID.fullmatch(value) is not None


def private_directory(path):
    if path.is_symlink():
        raise ResetError("Job directories must not be symbolic links")
    path.mkdir(mode=0o700, parents=True, exist_ok=False)
    if os.name == "nt":
        # Scope the ACL change to the newly created job directory, never its parent.
        flags = subprocess.CREATE_NO_WINDOW
        who = subprocess.run(["whoami", "/user", "/fo", "csv", "/nh"], capture_output=True,
                             text=True, check=True, creationflags=flags)
        sid = list(csv.reader(io.StringIO(who.stdout.strip())))[0][-1]
        if not re.fullmatch(r"S-1-[0-9-]+", sid):
            raise ResetError("Could not establish the local operator identity")
        acl = subprocess.run(["icacls", str(path), "/inheritance:r", "/grant:r", f"*{sid}:(OI)(CI)F"],
                             capture_output=True, creationflags=flags)
        if acl.returncode:
            raise ResetError("Could not restrict the new job directory to the local operator")
    else:
        path.chmod(0o700)


class Job:
    """An OS-held lock survives neither process exit nor a crash; no stale-PID override."""
    def __init__(self, path, create=False):
        self.path = Path(path).absolute()
        self.db = None
        self.lock = None
        if create:
            private_directory(self.path)
        if not self.path.is_dir() or self.path.is_symlink():
            raise ResetError("Job directory is missing or is a symbolic link")
        if os.name != "nt" and self.path.stat().st_mode & 0o077:
            raise ResetError("Job directory must be private (mode 0700)")
        for name in ("job.sqlite3", "operator.lock"):
            if (self.path / name).is_symlink():
                raise ResetError("Job files must not be symbolic links")
        try:
            self.lock = open(self.path / "operator.lock", "a+b")
            if os.name == "nt":
                import msvcrt
                self.lock.seek(0)
                if self.lock.read(1) == b"":
                    self.lock.write(b"0")
                    self.lock.flush()
                self.lock.seek(0)
                msvcrt.locking(self.lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            db_path = self.path / "job.sqlite3"
            if not create and not db_path.is_file():
                raise ResetError("Job database is missing")
            self.db = sqlite3.connect(db_path, isolation_level=None)
            self.db.row_factory = sqlite3.Row
            self.db.execute("PRAGMA journal_mode=DELETE")
            self.db.execute("PRAGMA synchronous=FULL")
            self.db.execute("PRAGMA secure_delete=ON")
            if create:
                self.db.executescript("""
                  CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
                  CREATE TABLE operations(subject TEXT NOT NULL,role TEXT NOT NULL,op_id TEXT NOT NULL UNIQUE,
                    state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(subject,role));
                  CREATE TABLE events(sequence INTEGER PRIMARY KEY,at INTEGER NOT NULL,kind TEXT NOT NULL,
                    op_id TEXT,role TEXT,detail TEXT NOT NULL);
                """)
                self.set("job_id", uuid.uuid4().hex)
                self.set("state", "new")
            if os.name != "nt":
                db_path.chmod(0o600)
                (self.path / "operator.lock").chmod(0o600)
        except (OSError, sqlite3.Error, ResetError) as exc:
            self.close()
            raise ResetError("Job unavailable or already locked by another operator") from exc

    def get(self, key, default=None):
        row = self.db.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    def set(self, key, value):
        self.db.execute("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                        (key, canonical(value)))

    @contextlib.contextmanager
    def transaction(self):
        self.db.execute("BEGIN IMMEDIATE")
        try:
            yield
            self.db.execute("COMMIT")
        except BaseException:
            self.db.execute("ROLLBACK")
            raise

    def event(self, kind, op=None, role=None, detail="", at=None):
        self.db.execute("INSERT INTO events(at,kind,op_id,role,detail) VALUES(?,?,?,?,?)",
                        (clock(at), kind, op, role, detail))

    def close(self):
        if self.db is not None:
            self.db.close()
            self.db = None
        if self.lock is not None:
            self.lock.close()
            self.lock = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


class DiscordApi:
    def __init__(self, token):
        if not token or any(c.isspace() for c in token):
            raise ResetError("A bot token is required; use the private prompt or documented environment variable")
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect())
        self.not_before = 0.0
        self.write_deadline = None

    def request(self, method, path):
        member = rf"/guilds/{GUILD_ID}/members/[0-9]{{17,20}}"
        allowed = (method == "GET" and (path == "/users/@me" or path in (f"/guilds/{GUILD_ID}", f"/guilds/{GUILD_ID}/roles")
                   or re.fullmatch(member, path) or re.fullmatch(rf"/guilds/{GUILD_ID}/members\?limit=1000&after=(0|[0-9]{{17,20}})", path)))
        deletion = re.fullmatch(member + r"/roles/([0-9]{17,20})", path)
        if not allowed and not (method == "DELETE" and deletion and deletion[1] in ROLE_IDS):
            raise ResetError("Provider request outside the fixed Stockades scope")
        for attempt in range(2 if method == "GET" else 1):
            wait = self.not_before - time.monotonic()
            if wait > 60:
                raise ResetError("Discord cooldown exceeds one minute; stop and resume later")
            if wait > 0:
                time.sleep(wait)
            if method == "DELETE" and self.write_deadline is not None and clock() >= self.write_deadline:
                raise ResetError("Plan expired during the provider cooldown; no DELETE was sent")
            req = urllib.request.Request("https://discord.com/api/v10" + path, method=method,
                                         headers={"Authorization": "Bot " + self.token,
                                                  "User-Agent": "OlympusStockadesRoleReset/1.0",
                                                  "X-Audit-Log-Reason": "Owner-approved%20Stockades%20legacy-role%20reset"})
            try:
                with self.opener.open(req, timeout=20) as response:
                    if method == "DELETE":
                        if response.status != 204:
                            raise APIError(response.status)
                        value = None
                    else:
                        raw = response.read(MAX_RESPONSE + 1)
                        if len(raw) > MAX_RESPONSE:
                            raise ResetError("Discord response exceeds the bounded reader")
                        value = json.loads(raw)
                    if response.headers.get("X-RateLimit-Remaining") == "0":
                        try:
                            delay = max(0.0, float(response.headers.get("X-RateLimit-Reset-After", "1")))
                        except ValueError:
                            delay = 1.0
                        self.not_before = time.monotonic() + (delay if math.isfinite(delay) else 60.0)
                    return value
            except urllib.error.HTTPError as exc:
                delay = 0.0
                if exc.code == 429:
                    try:
                        body = json.loads(exc.read(16384))
                        delay = float(body.get("retry_after", exc.headers.get("Retry-After", "1")))
                    except (ValueError, TypeError, AttributeError):
                        delay = 1.0
                    if not math.isfinite(delay) or not 0 <= delay <= 3600:
                        delay = 60.0
                    self.not_before = time.monotonic() + delay
                    if method == "GET" and attempt == 0 and delay <= 60:
                        continue
                raise APIError(exc.code, delay) from None
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
                raise ResetError("Discord transport or response outcome is unknown") from None


def roles_of(member, expected=None):
    if not isinstance(member, dict) or not isinstance(member.get("user"), dict):
        raise ResetError("Discord member shape is invalid")
    subject, roles = member["user"].get("id"), member.get("roles")
    if not snowflake(subject) or expected is not None and subject != expected:
        raise ResetError("Discord member identity mismatch")
    if not isinstance(roles, list) or len(roles) > 250 or any(not snowflake(r) for r in roles) or len(roles) != len(set(roles)):
        raise ResetError("Discord role membership shape is invalid")
    return subject, roles


def preflight(api):
    bot = api.request("GET", "/users/@me")
    if not isinstance(bot, dict) or bot.get("bot") is not True or not snowflake(bot.get("id")):
        raise ResetError("Only a Discord bot identity is supported")
    guild = api.request("GET", f"/guilds/{GUILD_ID}")
    if not isinstance(guild, dict) or guild.get("id") != GUILD_ID:
        raise ResetError("Discord guild identity mismatch")
    raw_roles = api.request("GET", f"/guilds/{GUILD_ID}/roles")
    if not isinstance(raw_roles, list) or not 1 <= len(raw_roles) <= 250:
        raise ResetError("Discord role inventory is invalid")
    roles = {}
    for role in raw_roles:
        if not isinstance(role, dict) or not snowflake(role.get("id")) or role["id"] in roles:
            raise ResetError("Discord role identity is invalid")
        if not isinstance(role.get("position"), int) or isinstance(role["position"], bool) or role["position"] < 0:
            raise ResetError("Discord role hierarchy is invalid")
        if not isinstance(role.get("permissions"), str) or not role["permissions"].isdigit():
            raise ResetError("Discord role permissions are invalid")
        roles[role["id"]] = role
    if any(r not in roles for r in (GUILD_ID, *ROLE_IDS)):
        raise ResetError("An expected role definition is missing; no reset is allowed")
    _, bot_roles = roles_of(api.request("GET", f"/guilds/{GUILD_ID}/members/{bot['id']}"), bot["id"])
    if any(r not in roles for r in bot_roles):
        raise ResetError("Bot role inventory is inconsistent")
    highest = max((roles[r]["position"] for r in bot_roles), default=0)
    permissions = int(roles[GUILD_ID]["permissions"])
    for r in bot_roles:
        permissions |= int(roles[r]["permissions"])
    blockers = []
    if not permissions & ((1 << 28) | 8):
        blockers.append({"reason": "bot_missing_manage_roles"})
    for r in ROLE_IDS:
        role = roles[r]
        if role.get("managed") is not False:
            blockers.append({"role": r, "reason": "managed_or_unknown_role"})
        if int(role["permissions"]) & SENSITIVE_PERMISSIONS:
            blockers.append({"role": r, "reason": "role_has_authority_permissions"})
        if role["position"] >= highest:
            blockers.append({"role": r, "reason": "role_at_or_above_bot"})
    selected_roles = [{"id": r, "expected_name": name,
                       "current_name": roles[r].get("name"), "position": roles[r]["position"],
                       "permissions": roles[r]["permissions"], "managed": roles[r].get("managed")}
                      for r, name in ROLES]
    return {"bot_id": bot["id"], "roles_digest": digest(sorted(raw_roles, key=lambda r: int(r["id"]))),
            "role_count": len(raw_roles), "selected_roles": selected_roles, "blockers": blockers}


def inventory(api):
    after, total, pairs, protected, counts = "0", 0, [], [], {r: 0 for r in ROLE_IDS}
    protected_counts = {}
    while True:
        page = api.request("GET", f"/guilds/{GUILD_ID}/members?limit=1000&after={after}")
        if not isinstance(page, list) or len(page) > 1000:
            raise ResetError("Discord member page is invalid or incomplete")
        previous = int(after)
        for member in page:
            subject, roles = roles_of(member)
            if int(subject) <= previous:
                raise ResetError("Discord pagination is unordered or repeated")
            previous = int(subject)
            for role in roles:
                if role in ROLE_IDS:
                    pairs.append([subject, role])
                    counts[role] += 1
                else:
                    protected.append([subject, role])
                    protected_counts[role] = protected_counts.get(role, 0) + 1
            total += 1
            if total > MAX_MEMBERS or len(pairs) > MAX_PAIRS or len(protected) > MAX_MEMBERS * 50:
                raise ResetError("Inventory exceeds this attended tool's bounds")
        if len(page) < 1000:
            break
        after = page[-1]["user"]["id"]
    # Only targeted IDs enter the job. One aggregate digest covers other memberships.
    return {"pairs": sorted(pairs), "role_counts": counts, "member_count": total, "protected_role_counts": protected_counts,
            "protected_digest": digest(sorted(protected))}


def load_plan(job):
    plan = job.get("plan")
    if not isinstance(plan, dict) or plan.get("guild_id") != GUILD_ID or plan.get("scope") != SCOPE or plan.get("role_ids") != list(ROLE_IDS):
        raise ResetError("Job is not the fixed Stockades profile")
    pairs = plan.get("pairs")
    if not isinstance(pairs, list) or len(pairs) > MAX_PAIRS:
        raise ResetError("Job plan is malformed")
    if any(not isinstance(p, list) or len(p) != 2 or not snowflake(p[0]) or p[1] not in ROLE_IDS for p in pairs):
        raise ResetError("Job assignment outside approved scope")
    if pairs != sorted(pairs) or len(pairs) != len({tuple(p) for p in pairs}):
        raise ResetError("Job assignments are not unique and canonical")
    if digest(plan) != job.get("plan_sha"):
        raise ResetError("Job plan integrity check failed")
    rows = job.db.execute("SELECT subject,role,state,attempts FROM operations ORDER BY subject,role").fetchall()
    if [[r["subject"], r["role"]] for r in rows] != pairs:
        raise ResetError("Job operations differ from the approved plan")
    if any(r["state"] not in STATES or r["attempts"] not in (0, 1)
           or r["state"] == "pending" and r["attempts"] != 0 for r in rows):
        raise ResetError("Job operation state is invalid")
    return plan


def status(job):
    if job.get("state") == "redacted":
        return job.get("receipt")
    counts = {s: 0 for s in STATES}
    for row in job.db.execute("SELECT state,COUNT(*) n FROM operations GROUP BY state"):
        if row["state"] not in counts:
            raise ResetError("Job has an unknown operation state")
        counts[row["state"]] = row["n"]
    counts["planned"] = sum(counts.values())
    plan = job.get("plan", {})
    return {"state": job.get("state"), "job_id": job.get("job_id"), "guild_id": GUILD_ID, "scope": SCOPE,
            "plan_sha": job.get("plan_sha"), "expires_at": plan.get("expires_at"), "counts": counts,
            "bot_id": plan.get("bot_id"), "member_count": plan.get("member_count"), "role_definition_count": plan.get("role_count"),
            "role_counts": plan.get("role_counts", {}), "blockers": plan.get("blockers", []),
            "selected_roles": plan.get("selected_roles", []), "protected_role_counts": plan.get("protected_role_counts", {}),
            "verification": job.get("verification")}


def preview(job, api, at=None):
    if job.get("state") != "new":
        raise ResetError("A preview requires a fresh job directory; existing evidence is not overwritten")
    started = clock(at)
    before = preflight(api)
    scan = inventory(api)
    after = preflight(api)
    if before != after:
        raise ResetError("Bot identity, role definitions or permissions changed during discovery")
    plan = {"version": 1, "guild_id": GUILD_ID, "scope": SCOPE, "role_ids": list(ROLE_IDS),
            "created_at": started, "expires_at": started + MAX_AGE, **before, **scan}
    with job.transaction():
        job.set("plan", plan)
        job.set("plan_sha", digest(plan))
        job.set("state", "blocked" if before["blockers"] else "preview")
        job.db.executemany("INSERT INTO operations(subject,role,op_id,state) VALUES(?,?,?,'pending')",
                           [(s, r, uuid.uuid4().hex) for s, r in scan["pairs"]])
        job.event("preview", detail=f"assignments={len(scan['pairs'])}", at=at)
    return status(job)


def current_member(api, subject):
    try:
        _, roles = roles_of(api.request("GET", f"/guilds/{GUILD_ID}/members/{subject}"), subject)
        return roles
    except APIError as exc:
        if exc.status == 404:
            return None
        raise


def change(job, op, state, detail="", at=None):
    with job.transaction():
        job.db.execute("UPDATE operations SET state=? WHERE op_id=?", (state, op["op_id"]))
        job.event(state, op["op_id"], op["role"], detail, at)


def run(job, api, plan_sha, guild_id, scope, max_removals=25, at=None):
    plan = load_plan(job)
    if plan_sha != job.get("plan_sha") or guild_id != GUILD_ID or scope != SCOPE:
        raise ResetError("Exact plan SHA, Stockades guild and scope confirmation are required")
    if not isinstance(max_removals, int) or not 1 <= max_removals <= 100:
        raise ResetError("One run permits 1 to 100 planned role removals")
    if not plan["created_at"] <= clock(at) < plan["expires_at"]:
        raise ResetError("Plan expired or clock moved backwards; reconcile spent intents before a new preview")
    if job.get("state") in ("verified", "redacted"):
        raise ResetError("This job is terminal")
    if plan["blockers"]:
        raise ResetError("Preview has permission or hierarchy blockers; no role deletion is allowed")
    if job.db.execute("SELECT 1 FROM operations WHERE state IN ('dispatching','acknowledged','unknown','held') LIMIT 1").fetchone():
        raise ResetError("A spent or held intent requires GET-only reconciliation, not another DELETE")
    pre = preflight(api)
    if pre["bot_id"] != plan["bot_id"] or pre["roles_digest"] != plan["roles_digest"] or pre["blockers"]:
        raise ResetError("Bot identity, role definitions, permissions or hierarchy changed; preview again")
    with job.transaction():
        job.set("state", "running")
        job.event("confirmed", detail="exact_plan_guild_scope", at=at)
    selected = job.db.execute("SELECT * FROM operations WHERE state='pending' ORDER BY subject,role LIMIT ?", (max_removals,)).fetchall()
    for op in selected:
        if not plan["created_at"] <= clock(at) < plan["expires_at"]:
            job.set("state", "paused")
            raise ResetError("Plan expired during the slice; remaining assignments were not dispatched")
        roles = current_member(api, op["subject"])
        if roles is None or op["role"] not in roles:
            change(job, op, "observed_absent", "no_delete_needed", at)
            continue
        fresh = preflight(api)
        if fresh["bot_id"] != plan["bot_id"] or fresh["roles_digest"] != plan["roles_digest"] or fresh["blockers"]:
            job.set("state", "paused")
            raise ResetError("Bot identity or role configuration changed during the slice; no further DELETE was sent")
        if not plan["created_at"] <= clock(at) < plan["expires_at"]:
            job.set("state", "paused")
            raise ResetError("Plan expired during the member/preflight reads; no DELETE was sent")
        with job.transaction():
            updated = job.db.execute("UPDATE operations SET state='dispatching',attempts=1 WHERE op_id=? AND state='pending' AND attempts=0", (op["op_id"],))
            if updated.rowcount != 1:
                raise ResetError("Operation was already consumed")
            job.event("dispatching", op["op_id"], op["role"], at=at)
        # Crash or lost ACK after this durable boundary leaves a spent intent.
        try:
            if isinstance(api, DiscordApi):
                api.write_deadline = plan["expires_at"]
            api.request("DELETE", f"/guilds/{GUILD_ID}/members/{op['subject']}/roles/{op['role']}")
        except Exception as exc:
            reason = f"http_{exc.status}" if isinstance(exc, APIError) else "transport_or_ack_unknown"
            change(job, op, "unknown", reason, at)
            job.set("state", "held")
            return status(job)
        change(job, op, "acknowledged", "discord_204", at)
        try:
            after = current_member(api, op["subject"])
        except Exception:
            job.set("state", "held")
            return status(job)
        if after is not None and set(after) - {op["role"]} != set(roles) - {op["role"]}:
            change(job, op, "held", "unrelated_membership_drift", at)
            job.set("state", "held")
            return status(job)
        if after is not None and op["role"] in after:
            change(job, op, "held", "role_still_present_after_ack", at)
            job.set("state", "held")
            return status(job)
        change(job, op, "confirmed_absent", "ack_and_member_readback", at)
    job.set("state", "ready_to_verify" if not job.db.execute("SELECT 1 FROM operations WHERE state='pending' LIMIT 1").fetchone() else "paused")
    return status(job)


def reconcile(job, api, at=None):
    load_plan(job)
    if job.get("state") in ("verified", "redacted"):
        raise ResetError("This job is terminal")
    for op in job.db.execute("SELECT * FROM operations WHERE state IN ('pending','dispatching','acknowledged','unknown','held') ORDER BY subject,role").fetchall():
        roles = current_member(api, op["subject"])
        absent = roles is None or op["role"] not in roles
        if op["state"] == "pending" and not absent:
            continue
        change(job, op, "observed_absent" if absent else "held",
               "get_only_absence_not_causal_proof" if absent else "get_only_present_requires_new_plan", at)
    unresolved = job.db.execute("SELECT 1 FROM operations WHERE state IN ('dispatching','acknowledged','unknown','held') LIMIT 1").fetchone()
    pending = job.db.execute("SELECT 1 FROM operations WHERE state='pending' LIMIT 1").fetchone()
    job.set("state", "held" if unresolved else "paused" if pending else "ready_to_verify")
    return status(job)


def verify(job, api, at=None):
    plan = load_plan(job)
    before = preflight(api)
    scan = inventory(api)
    after = preflight(api)
    same_roles = before["roles_digest"] == after["roles_digest"] == plan["roles_digest"]
    same_bot = before["bot_id"] == after["bot_id"] == plan["bot_id"]
    unresolved = job.db.execute("SELECT COUNT(*) FROM operations WHERE state IN ('dispatching','acknowledged','unknown','held')").fetchone()[0]
    pending = job.db.execute("SELECT COUNT(*) FROM operations WHERE state='pending'").fetchone()[0]
    proof = {"at": clock(at), "role_counts": scan["role_counts"], "remaining_assignments": len(scan["pairs"]),
             "same_role_definitions": same_roles, "same_bot": same_bot,
             "same_other_memberships": scan["protected_digest"] == plan["protected_digest"],
             "unresolved_intents": unresolved, "unprocessed_intents": pending,
             "point_in_time_scan": True, "future_no_regrant_guarantee": False}
    clean = not scan["pairs"] and same_roles and same_bot and proof["same_other_memberships"] and not unresolved and not pending
    with job.transaction():
        job.set("verification", proof)
        job.set("state", "verified" if clean else "verification_failed")
        job.event("verified" if clean else "verification_failed", detail=f"residual={len(scan['pairs'])}", at=at)
    return status(job)


def redact(job):
    plan = load_plan(job)
    if job.get("state") != "verified":
        raise ResetError("Only a verified terminal job can redact; unresolved evidence must be retained")
    if job.db.execute("SELECT 1 FROM operations WHERE state NOT IN ('confirmed_absent','observed_absent') LIMIT 1").fetchone():
        raise ResetError("Unresolved operation evidence cannot be redacted")
    receipt = {"state": "redacted", "job_id": job.get("job_id"), "guild_id": GUILD_ID, "scope": SCOPE,
               "counts": status(job)["counts"], "role_counts": {r: 0 for r in ROLE_IDS},
               "baseline_assignments": len(plan["pairs"]), "verified_at": job.get("verification")["at"],
               "role_definitions_preserved": True, "other_memberships_unchanged_at_scan": True,
               "contains_member_ids": False, "contains_plan_or_identity_digests": False}
    with job.transaction():
        job.db.execute("DELETE FROM operations")
        job.db.execute("DELETE FROM events")
        job.db.execute("DELETE FROM meta")
        job.set("state", "redacted")
        job.set("receipt", receipt)
    # secure_delete + DELETE journal + VACUUM removes IDs from live DB free pages.
    # This cannot erase external backups, filesystem snapshots or prior exports.
    job.db.execute("VACUUM")
    return receipt


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest="command", required=True)
    for name in ("preview", "run", "reconcile", "verify", "status", "redact"):
        child = subs.add_parser(name)
        child.add_argument("--job", required=True, type=Path)
        if name in ("preview", "run", "reconcile", "verify"):
            child.add_argument("--prompt-token", action="store_true", help="Read a bot token privately; never put it on the command line")
        if name == "run":
            child.add_argument("--confirm-plan", required=True)
            child.add_argument("--confirm-guild", required=True)
            child.add_argument("--confirm-scope", required=True)
            child.add_argument("--max-removals", type=int, default=25)
    args = parser.parse_args(argv)
    try:
        with Job(args.job, create=args.command == "preview") as job:
            if args.command in ("status", "redact"):
                result = status(job) if args.command == "status" else redact(job)
            else:
                if args.prompt_token and not sys.stdin.isatty():
                    raise ResetError("The private token prompt requires an interactive terminal")
                token = getpass.getpass("Discord bot token (not saved): ") if args.prompt_token else os.environ.get("OLYMPUS_ROLE_RESET_BOT_TOKEN", "")
                api = DiscordApi(token)
                if args.command == "preview":
                    result = preview(job, api)
                elif args.command == "run":
                    result = run(job, api, args.confirm_plan, args.confirm_guild, args.confirm_scope, args.max_removals)
                elif args.command == "reconcile":
                    result = reconcile(job, api)
                else:
                    result = verify(job, api)
            print(json.dumps(result, indent=2, sort_keys=True))
            return 0 if result["state"] not in ("blocked", "held", "verification_failed") else 2
    except ResetError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except (OSError, sqlite3.Error, ValueError):
        # Provider bodies and exception reprs may contain account IDs or credentials.
        # The status command and journal supply bounded operational diagnostics.
        print("Reset stopped safely. Check local job status and the runbook; no automatic mutation retry was made.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

"""Offline, exact-state custody review. Never imports a transport or reads configuration."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import re
import stat
import sys
import time
from pathlib import Path
from typing import Any


# Attended recovery (owner, 14 November 2026) is deliberately smaller than a
# replay protocol: only these unresolved ordinary lanes can leave the live box.
QUARANTINE_PATHS = ("/ingest/verify", "/ingest/events", "/ingest/roster")
QUARANTINE_MAX_BYTES = 64 * 1024 * 1024


def regular_identity(path: Path) -> tuple[int, int]:
    info = path.lstat()
    if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or path.is_symlink()
            or getattr(info, "st_file_attributes", 0) & 0x400):
        raise ValueError("state must be a regular, single-link, non-reparse file")
    return info.st_dev, info.st_ino


def reviewed_path(given: Path) -> Path:
    if os.name == "nt":
        if given.drive.startswith("\\\\"):
            raise ValueError("local state path required")
        for part in given.parts[1:] if given.anchor else given.parts:
            if (part == ".." or part.endswith((" ", ".")) or ":" in part
                    or any(ord(char) < 32 for char in part)
                    or re.fullmatch(r"(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?", part)):
                raise ValueError("ambiguous/reserved state path refused")
    path = Path(os.path.abspath(given))
    for parent in reversed(path.parents):
        info = parent.lstat()
        if not stat.S_ISDIR(info.st_mode) or parent.is_symlink() or getattr(info, "st_file_attributes", 0) & 0x400:
            raise ValueError("state parent aliases/reparse points are refused")
    if path.exists() or path.is_symlink():
        regular_identity(path)
    # On Windows realpath resolves existing DOS8.3 names as well as the long
    # canonical parent of a new file. Refuse aliases before deriving a lock name.
    if os.path.normcase(str(path)) != os.path.normcase(os.path.realpath(path)):
        raise ValueError("canonical long state path required")
    return path


def private_create(path: Path):
    """Exclusive private receipt file, including a protected DACL on Windows."""
    if os.name != "nt":
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            return os.fdopen(fd, "wb")
        except BaseException:
            os.close(fd)
            raise
    import ctypes
    import msvcrt
    from ctypes import wintypes
    class SecurityAttributes(ctypes.Structure):
        _fields_ = [("nLength", wintypes.DWORD), ("lpSecurityDescriptor", wintypes.LPVOID), ("bInheritHandle", wintypes.BOOL)]
    descriptor = wintypes.LPVOID()
    advapi = ctypes.WinDLL("advapi32", use_last_error=True)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    convert = advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW
    convert.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.POINTER(wintypes.LPVOID), ctypes.POINTER(wintypes.DWORD)]
    convert.restype = wintypes.BOOL
    create = kernel.CreateFileW
    create.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.POINTER(SecurityAttributes), wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    create.restype = wintypes.HANDLE
    kernel.LocalFree.argtypes = [wintypes.LPVOID]
    kernel.LocalFree.restype = wintypes.LPVOID
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    # OWNER RIGHTS resolves to the owner of the newly created file; SYSTEM may
    # retain it for the machine's existing backup/security duties. No inherited ACEs.
    if not convert("D:P(A;;FA;;;SY)(A;;FA;;;OW)", 1, ctypes.byref(descriptor), None):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        attrs = SecurityAttributes(ctypes.sizeof(SecurityAttributes), descriptor, False)
        handle = create(str(path), 0x40000000, 0, ctypes.byref(attrs), 1, 0x80, None)
        if handle == wintypes.HANDLE(-1).value:
            code = ctypes.get_last_error()
            if code in (80, 183):
                raise FileExistsError("receipt already exists; inspect prior attempt")
            raise ctypes.WinError(code)
    finally:
        kernel.LocalFree(descriptor)
    try:
        fd = msvcrt.open_osfhandle(handle, os.O_WRONLY | os.O_BINARY)
    except BaseException:
        kernel.CloseHandle(handle)
        raise
    try:
        return os.fdopen(fd, "wb")
    except BaseException:
        os.close(fd)
        raise


class StateLease:
    """One cooperating writer; the kernel releases ownership after process death."""
    MARKER = b"OLYMPUS-STATE-ADVISORY-LOCK-V1\n"

    def __init__(self, state_path: Path):
        state_path = reviewed_path(state_path)
        self.path = state_path.with_name(state_path.name + ".custody-lock")
        self.fd: int | None = None
        self.identity: tuple[int, int] | None = None

    def __enter__(self):
        # Keep one stable inode: unlinking a released advisory lock could split
        # ownership between an existing opener and a newly created file. AA-LOCK,
        # owner's .197 correction (2026-10-24): no PID/age reclamation is used.
        created = False
        flags = os.O_RDWR | getattr(os, "O_NOFOLLOW", 0)
        try:
            self.fd = os.open(self.path, flags | os.O_CREAT | os.O_EXCL, 0o600)
            created = True
        except FileExistsError:
            regular_identity(self.path)
            self.fd = os.open(self.path, flags)
        try:
            info = os.fstat(self.fd)
            self.identity = (info.st_dev, info.st_ino)
            if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
                    or regular_identity(self.path) != self.identity):
                raise ValueError("lock must remain an ordinary single-link file")
            try:
                if os.name == "nt":
                    import msvcrt
                    os.lseek(self.fd, 0, os.SEEK_SET)
                    msvcrt.locking(self.fd, msvcrt.LK_NBLCK, 1)
                elif os.name == "posix":
                    import fcntl
                    fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                else:
                    raise OSError("unsupported state-lock platform")
            except (BlockingIOError, PermissionError) as error:
                raise FileExistsError("state has an active writer/recovery lease") from error
            if created:
                written = 0
                while written < len(self.MARKER):
                    count = os.write(self.fd, self.MARKER[written:])
                    if count < 1:
                        raise OSError("lease initialization incomplete")
                    written += count
                os.fsync(self.fd)
            else:
                os.lseek(self.fd, 0, os.SEEK_SET)
                if os.read(self.fd, len(self.MARKER) + 1) != self.MARKER:
                    # An old O_EXCL writer may still own this file without an OS
                    # lock. Its PID/age cannot prove it stopped: never adopt it.
                    raise FileExistsError("legacy/unreadable lease requires attended migration")
            if regular_identity(self.path) != self.identity:
                raise ValueError("state lock identity changed")
        except BaseException:
            self.__exit__()
            raise
        return self

    def __exit__(self, *_):
        if self.fd is not None:
            fd, self.fd = self.fd, None
            os.close(fd)  # OS lock release, including termination; never unlink.


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def item_digest(item: Any) -> str:
    return digest(json.dumps(item, sort_keys=True, allow_nan=False, separators=(",", ":")).encode())


def retained(item: Any) -> bool:
    try:
        expected = digest(json.dumps([item["path"], item["body"], item["at"], item["binding"]], allow_nan=False).encode())
        return (isinstance(item, dict) and item.get("custody") == 1 and type(item.get("at")) is int
                and isinstance(item.get("binding"), str) and re.fullmatch(r"[0-9a-f]{64}", item["binding"]) is not None
                and item.get("digest") == expected)
    except (KeyError, TypeError, ValueError, OverflowError):
        return False


def load(path: Path) -> tuple[bytes, dict[str, Any]]:
    path = reviewed_path(path)
    regular_identity(path)
    raw = path.read_bytes()
    value = json.loads(raw)
    if not isinstance(value, dict) or not isinstance(value.get("outbox", []), list):
        raise ValueError("invalid state; original retained")
    pending = value.get("queue_written_pending", [])
    if not isinstance(pending, list):
        raise ValueError("invalid pending IDs; original retained")
    return raw, value


def selected(state: dict[str, Any], lane: str) -> Any:
    if lane not in ("outbox", "queue-written"):
        raise ValueError("unknown custody lane")
    if lane == "outbox":
        box = state.get("outbox", [])
        if not box:
            raise ValueError("outbox empty")
        return box[0]
    original = state.get("queue_written_original")
    if original is None:
        raise ValueError("no captured queue acknowledgment; legacy IDs remain held")
    if (not isinstance(original, dict) or original.get("path") != "/queue/written"
            or not isinstance(original.get("body"), dict)
            or original["body"].get("ids") != state.get("queue_written_pending", [])):
        raise ValueError("queue original/IDs mismatch; retained")
    return original


def classify(item: Any) -> str:
    if not retained(item):
        return "legacy-or-changed-original-held"
    if item.get("acknowledged") is True:
        return "recorded-acknowledgment-local-settlement-only"
    status = item.get("refusal_status")
    if (type(status) is int and (status in (400, 401, 403, 404, 405, 429)
            or status == 422 and item.get("path") == "/ingest/roster")):
        return "recorded-definite-nonapplication-attended-retirement-only"
    return "unknown-outcome-held"


def _financial_original(value: Any) -> bool:
    """Recognise financial structure, never search or publish free-text notes."""
    pending = [value]
    while pending:
        current = pending.pop()
        if isinstance(current, dict):
            if any(key in current for key in ("donation", "copper", "money", "payment", "financial")):
                return True
            if current.get("type") in ("donation", "tithe", "payment", "financial"):
                return True
            source = current.get("source")
            if isinstance(source, str) and source.startswith(("tithe-", "treasury-")):
                return True
            pending.extend(current.values())
        elif isinstance(current, list):
            pending.extend(current)
    return False


def _quarantine_manifest(state: dict[str, Any]) -> tuple[dict[str, Any], dict[str, int]]:
    box = state.get("outbox")
    if not isinstance(box, list) or not box:
        raise ValueError("whole nonempty outbox required")
    counts = {path: 0 for path in QUARANTINE_PATHS}
    entries = []
    for position, original in enumerate(box):
        if (type(original) is not dict or type(original.get("custody")) is not int
                or original.get("custody") != 1 or not retained(original)
                or type(original.get("at")) is not int or original["at"] <= 0
                or original.get("path") not in QUARANTINE_PATHS
                or type(original.get("body")) is not dict
                or "acknowledged" in original and original["acknowledged"] is not False
                or original.get("refusal_status") is not None
                or "server_expired" in original or _financial_original(original)):
            raise ValueError("all originals must be valid ordinary unresolved records")
        # Hash the entire record, not only its body: order, original metadata and
        # every retained field remain part of the operator's exact selection.
        entries.append({"index": position, "path": original["path"], "itemSha256": item_digest(original)})
        counts[original["path"]] += 1
    return {"schema": "watcher-unresolved-manifest-v1", "count": len(entries), "items": entries}, counts


def _manifest_digest(manifest: dict[str, Any]) -> str:
    return digest(json.dumps(manifest, sort_keys=True, allow_nan=False, separators=(",", ":")).encode())


def _strict_quarantine_state(raw: bytes) -> dict[str, Any]:
    if len(raw) > QUARANTINE_MAX_BYTES:
        raise ValueError("attended state size limit exceeded")
    def pairs(values):
        out = {}
        for key, value in values:
            if key in out:
                raise ValueError("ambiguous state keys refused")
            out[key] = value
        return out
    def constant(_):
        raise ValueError("nonfinite state refused")
    try:
        state = json.loads(raw.decode("utf-8"), object_pairs_hook=pairs, parse_constant=constant)
    except RecursionError as error:
        raise ValueError("state depth limit exceeded") from error
    if type(state) is not dict:
        raise ValueError("state object required")
    return state


def quarantine_unknown(path: Path, state_sha: str, manifest_sha: str, count: int, reason: str) -> dict[str, Any]:
    """Quarantine a pinned whole box offline; no delivery, refusal or retry is inferred.

    The private archive contains only the selected outbox originals, not other
    state, and can include personal data. It is attended recovery evidence under
    the existing privacy, erasure and retention obligations, not a new dispatch
    input. After convergence the exact archive needs a cleanup review under the
    published policy. No restoration, replay or automatic deletion is provided;
    this neither extends proof lifetimes nor claims that an erasure completed.
    """
    path = reviewed_path(path)
    if (not re.fullmatch(r"[0-9a-f]{64}", state_sha) or not re.fullmatch(r"[0-9a-f]{64}", manifest_sha)
            or type(count) is not int or count <= 0):
        raise ValueError("exact state, manifest and count pins required")
    if not isinstance(reason, str) or not 10 <= len(reason.strip()) <= 500:
        raise ValueError("attended reason must contain 10..500 characters")
    with StateLease(path):
        identity = regular_identity(path)
        if path.stat().st_size > QUARANTINE_MAX_BYTES:
            raise ValueError("attended state size limit exceeded")
        raw = path.read_bytes()
        if digest(raw) != state_sha:
            raise ValueError("state changed; inspect again, no mutation")
        state = _strict_quarantine_state(raw)
        if not isinstance(state.get("queue_written_pending", []), list):
            raise ValueError("invalid pending IDs; original retained")
        manifest, _ = _quarantine_manifest(state)
        if manifest["count"] != count or _manifest_digest(manifest) != manifest_sha:
            raise ValueError("ordered selection changed; no mutation")
        new = copy.deepcopy(state)
        new["outbox"] = []
        after = json.dumps(new, allow_nan=False).encode()
        created = int(time.time())
        if not 0 < created <= 9007199254740991 - 86400:
            raise ValueError("recovery review time unavailable")
        receipt = {"schema": "watcher-attended-quarantine-v1", "createdAt": created, "reviewBy": created + 86400,
                   "purpose": "attended-recovery", "outcome": "unknown", "replayed": False,
                   "action": "quarantined-unresolved", "lane": "outbox", "selection": "whole-outbox",
                   "reason": reason.strip(), "beforeStateSha256": state_sha, "afterStateSha256": digest(after),
                   "manifestSha256": manifest_sha, "manifest": manifest, "originals": state["outbox"],
                   "deliveryAcknowledged": False, "network": False,
                   "dispatchAuthority": False}
        archive_raw = json.dumps(receipt, allow_nan=False).encode()
        if len(after) > QUARANTINE_MAX_BYTES or len(archive_raw) > QUARANTINE_MAX_BYTES:
            raise ValueError("attended recovery output size limit exceeded")
        archive = path.with_name(path.name + ".custody-quarantine-" + state_sha + "-" + manifest_sha + ".json")
        # Archive first, exclusively. A partial archive or any uncertain replace
        # result is evidence to inspect, never permission for an automatic repeat.
        with private_create(archive) as stream:
            info = os.fstat(stream.fileno())
            archived_identity = (info.st_dev, info.st_ino)
            if stream.write(archive_raw) != len(archive_raw):
                raise OSError("private archive write incomplete")
            stream.flush()
            os.fsync(stream.fileno())
        if (regular_identity(archive) != archived_identity or archive.stat().st_size != len(archive_raw)
                or archive.read_bytes() != archive_raw):
            raise ValueError("private archive readback differs; original state not replaced")
        if (regular_identity(path) != identity or path.stat().st_size > QUARANTINE_MAX_BYTES
                or digest(path.read_bytes()) != state_sha):
            raise ValueError("state changed after archive; original state not replaced")
        tmp = path.with_name(path.name + ".custody-recovery.tmp")
        with private_create(tmp) as stream:
            if stream.write(after) != len(after):
                raise OSError("private replacement write incomplete")
            stream.flush()
            os.fsync(stream.fileno())
        replacement = regular_identity(tmp)
        if tmp.stat().st_size != len(after) or tmp.read_bytes() != after:
            raise ValueError("private replacement readback differs; original state not replaced")
        if (regular_identity(path) != identity or path.stat().st_size > QUARANTINE_MAX_BYTES
                or digest(path.read_bytes()) != state_sha):
            raise ValueError("state changed before replace; original state not replaced")
        os.replace(tmp, path)
        if regular_identity(path) != replacement or path.read_bytes() != after:
            raise ValueError("state replacement readback differs; inspect, never repeat blindly")
        return {"action": "quarantined-unresolved", "stateSha256": digest(after), "archive": str(archive),
                "manifestSha256": manifest_sha, "quarantinedCount": count, "deliveryAcknowledged": False,
                "network": False, "dispatchAuthority": False, "outcome": "unknown", "replayed": False,
                "createdAt": created, "reviewBy": created + 86400}


def inspect(path: Path) -> dict[str, Any]:
    raw, state = load(path)
    # Output does not disclose payloads, names, codes, tokens or provider response bodies.
    result: dict[str, Any] = {"stateSha256": digest(raw), "outboxCount": len(state.get("outbox", [])), "network": False}
    for lane in ("outbox", "queue-written"):
        try:
            item = selected(state, lane)
            result[lane] = {"itemSha256": item_digest(item), "classification": classify(item)}
        except ValueError:
            result[lane] = {"classification": "absent-or-legacy-IDs-held"}
    try:
        manifest, counts = _quarantine_manifest(_strict_quarantine_state(raw))
        result["quarantineUnknown"] = {"eligible": True, "count": manifest["count"],
                                       "pathCounts": counts, "manifestSha256": _manifest_digest(manifest)}
    except (ValueError, TypeError, OverflowError, RecursionError):
        result["quarantineUnknown"] = {"eligible": False, "count": len(state.get("outbox", [])),
                                       "manifestSha256": None}
    return result


def recover(path: Path, lane: str, action: str, state_sha: str, item_sha: str, reason: str) -> dict[str, Any]:
    path = reviewed_path(path)
    if not re.fullmatch(r"[0-9a-f]{64}", state_sha) or not re.fullmatch(r"[0-9a-f]{64}", item_sha):
        raise ValueError("exact SHA256 pins required")
    if not isinstance(reason, str) or not 10 <= len(reason.strip()) <= 500:
        raise ValueError("attended reason must contain 10..500 characters")
    with StateLease(path):
        identity = regular_identity(path)
        raw, state = load(path)
        if digest(raw) != state_sha:
            raise ValueError("state changed; inspect again, no mutation")
        original = selected(state, lane)
        if item_digest(original) != item_sha or not retained(original):
            raise ValueError("original changed or lacks captured authority; retained")
        kind = classify(original)
        if ((action == "settle-acknowledged" and kind != "recorded-acknowledgment-local-settlement-only")
                or (action == "retire-refused" and kind != "recorded-definite-nonapplication-attended-retirement-only")
                or action not in ("settle-acknowledged", "retire-refused")):
            raise ValueError("operation is unknown/legacy or does not match recorded outcome; retained")
        new = copy.deepcopy(state)
        if lane == "outbox":
            new["outbox"].pop(0)
        else:
            new["queue_written_pending"] = []
            new["queue_written_original"] = None
        after = json.dumps(new).encode()
        archive = path.with_name(path.name + ".custody-archive-" + state_sha + "-" + item_sha + ".json")
        receipt = {"schema": "watcher-attended-custody-v1", "at": int(time.time()), "action": action,
                   "lane": lane, "reason": reason.strip(), "beforeStateSha256": state_sha,
                   "afterStateSha256": digest(after), "itemSha256": item_sha, "original": original,
                   "deliveryAcknowledged": action == "settle-acknowledged", "network": False}
        # Exclusive immutable original-first archive. A partial/unknown previous attempt requires inspection.
        with private_create(archive) as stream:
            stream.write(json.dumps(receipt, allow_nan=False).encode())
            stream.flush()
            os.fsync(stream.fileno())
        if regular_identity(path) != identity or digest(path.read_bytes()) != state_sha:
            raise ValueError("state changed after archive; original state not replaced")
        tmp = path.with_name(path.name + ".custody-recovery.tmp")
        with private_create(tmp) as stream:
            stream.write(after)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp, path)
        if path.read_bytes() != after:
            raise ValueError("state replacement readback differs; inspect, never repeat blindly")
        return {"action": action, "stateSha256": digest(after), "archive": str(archive),
                "deliveryAcknowledged": action == "settle-acknowledged", "network": False}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", required=True, type=Path, help="exact private state path; stop watcher first")
    parser.add_argument("action", choices=("inspect", "settle-acknowledged", "retire-refused", "quarantine-unknown"))
    parser.add_argument("--lane", choices=("outbox", "queue-written"), default="outbox")
    parser.add_argument("--state-sha256")
    parser.add_argument("--item-sha256")
    parser.add_argument("--manifest-sha256")
    parser.add_argument("--count", type=int)
    parser.add_argument("--reason")
    args = parser.parse_args()
    try:
        if args.action == "inspect":
            result = inspect(args.state)
        elif args.action == "quarantine-unknown":
            if args.lane != "outbox":
                raise ValueError("whole outbox quarantine only")
            result = quarantine_unknown(args.state, args.state_sha256 or "", args.manifest_sha256 or "",
                                        args.count, args.reason or "")
        else:
            result = recover(args.state, args.lane, args.action, args.state_sha256 or "", args.item_sha256 or "", args.reason or "")
        print(json.dumps(result))
        return 0
    except (OSError, ValueError, TypeError, OverflowError, RecursionError):
        # Never print exception data: a malformed private file can contain sensitive text.
        print("custody recovery refused or outcome requires inspection; no network request was made", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())

"""Generated data projections only; never the state/original custody journal.

Parent/descriptor checks bound accidental aliases and detected swaps. They do
not make Windows path-based replace immune to a privileged racing process.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import uuid
from custody_recovery import reviewed_path
from savedvars_source280 import MAX_BYTES, _parents, _regular

NAMES = {"OlympusQueue.lua", "OlympusVerifyLists.lua", "OlympusLaunchQueue.lua", "OlympusLaunchSelected.lua"}


class ProjectionUnavailable(ValueError):
    pass


def _target(path):
    try:
        before = _regular(path.lstat())
    except FileNotFoundError:
        return None, None
    if before[2] > MAX_BYTES:
        raise ProjectionUnavailable()
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(fd, "rb") as stream:
        if _regular(os.fstat(stream.fileno())) != before:
            raise ProjectionUnavailable()
        raw = stream.read(before[2] + 1)
        if (len(raw) != before[2] or _regular(os.fstat(stream.fileno())) != before
                or _regular(path.lstat()) != before):
            raise ProjectionUnavailable()
    return before, hashlib.sha256(raw).hexdigest()


def _guard(path, expected_parent):
    path, parent = Path(os.path.abspath(path)), Path(os.path.abspath(expected_parent))
    if path.name not in NAMES or os.path.normcase(str(path.parent)) != os.path.normcase(str(parent)):
        raise ProjectionUnavailable()
    reviewed_path(path)  # Existing canonical parents; no mkdir or alias following.
    fixed = path.with_suffix(".tmp")
    if fixed.exists() or fixed.is_symlink():
        reviewed_path(fixed)  # Retained old temp is never opened for writing/deleted.
    parents = _parents(path)
    target = _target(path)
    if _parents(path) != parents:
        raise ProjectionUnavailable()
    return path, parents, target


def write(path, expected_parent, payload, inputs, previous=None):
    """Return (written, receipt). Even an unchanged poll revalidates the path.

    The input hash excludes only caller-owned rendering clocks. The output hash
    binds the exact previously written bytes; an existing unknown file cannot
    acquire a no-op receipt just from its name or a persisted input hash.
    """
    temporary, created, parents = None, None, None
    try:
        path, parents, target = _guard(Path(path), Path(expected_parent))
        key = hashlib.sha256(json.dumps(inputs, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()).hexdigest()
        if previous is not None and previous.get("inputSHA256") == key and target[1] == previous.get("outputSHA256"):
            return False, previous
        raw = payload.encode("utf-8")
        if len(raw) > MAX_BYTES:
            raise ProjectionUnavailable()
        temporary = path.with_name("." + path.name + "." + uuid.uuid4().hex + ".tmp")
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(temporary, flags, 0o600)
        with os.fdopen(fd, "wb") as stream:
            created = _regular(os.fstat(stream.fileno()))
            if _regular(temporary.lstat())[:2] != created[:2] or _parents(path) != parents:
                raise ProjectionUnavailable()
            stream.write(raw); stream.flush(); os.fsync(stream.fileno())
            final = _regular(os.fstat(stream.fileno()))
            if final[2] != len(raw) or _regular(temporary.lstat()) != final:
                raise ProjectionUnavailable()
        _, current_parents, current = _guard(path, expected_parent)
        if current_parents != parents or current != target:
            raise ProjectionUnavailable()
        # There remains a path-based Windows rename race after this check. A
        # changed post-replace witness is held, never called a successful write.
        os.replace(temporary, path)
        written, digest = _target(path)
        if _parents(path) != parents or written[:4] != final[:4] or digest != hashlib.sha256(raw).hexdigest():
            raise ProjectionUnavailable()
        return True, {"inputSHA256": key, "outputSHA256": digest}
    except (OSError, ValueError, TypeError, OverflowError, RecursionError) as error:
        raise ProjectionUnavailable() from error
    finally:
        if temporary is not None and created is not None:
            try:
                if _parents(temporary) == parents and _regular(temporary.lstat())[:2] == created[:2]:
                    temporary.unlink()  # Only this call's exact exclusive temporary inode.
            except (OSError, ValueError):
                pass  # Unknown/replaced temp remains for inspection; never delete another file.

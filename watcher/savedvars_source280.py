"""Bounded, data-only owned SavedVariables read. A file stamp is never proof authority."""
from __future__ import annotations
import copy
from dataclasses import dataclass
import hashlib
import os
from pathlib import Path
import stat
import savedvars

MAX_BYTES = 16 * 1024 * 1024
_REPARSE = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)


class SourceUnavailable(ValueError):
    """Fixed source hold; callers must not print file contents or private paths."""


def _identity(info):
    # Windows3.14 lstat's compatibility ctime is birth time while fstat's is
    # change time. Compare the explicit birth field there; byte digest still
    # detects in-place edits with restored mtime/size. POSIX keeps true ctime.
    change = getattr(info, "st_birthtime_ns", info.st_ctime_ns) if os.name == "nt" else info.st_ctime_ns
    result = (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, change)
    if any(type(v) is not int or v < 0 for v in result) or not info.st_ino:
        raise SourceUnavailable()
    return result


def _regular(info):
    if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
            or getattr(info, "st_file_attributes", 0) & _REPARSE):
        raise SourceUnavailable()
    return _identity(info)


def _parents(path):
    result = []
    for parent in path.parents:
        info = parent.lstat()
        if (not stat.S_ISDIR(info.st_mode) or getattr(info, "st_file_attributes", 0) & _REPARSE
                or not info.st_ino):
            raise SourceUnavailable()
        result.append((str(parent), info.st_dev, info.st_ino, stat.S_IFMT(info.st_mode)))
    return tuple(result)


@dataclass(frozen=True)
class Snapshot:
    witness: tuple[int, ...]
    digest: str
    data: dict

    @property
    def mtime(self):
        return self.witness[3] / 1_000_000_000


def read(path: Path, previous: Snapshot | None = None) -> Snapshot:
    """Read at most16MiB+1 after descriptor checks; re-use only identical bytes.

    Every pass validates the path, descriptor and all existing parent identities.
    The digest also detects same-size/same-stamp in-place changes on platforms
    where ctime is a creation timestamp. Cached parsing never creates a new proof.
    """
    path = Path(os.path.abspath(path))
    try:
        parents = _parents(path)
        before = _regular(path.lstat())
        if before[2] > MAX_BYTES:
            raise SourceUnavailable()
        flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(path, flags)
        with os.fdopen(fd, "rb") as source:
            if _regular(os.fstat(source.fileno())) != before:
                raise SourceUnavailable()
            raw = source.read(min(MAX_BYTES, before[2]) + 1)
            if (len(raw) != before[2] or _regular(os.fstat(source.fileno())) != before
                    or _regular(path.lstat()) != before or _parents(path) != parents):
                raise SourceUnavailable()
        digest = hashlib.sha256(raw).hexdigest()
        if previous is not None and previous.witness == before and previous.digest == digest:
            return previous
        data = savedvars.parse(raw.decode("utf-8-sig", errors="strict"))
        if type(data) is not dict:
            raise SourceUnavailable()
        return Snapshot(before, digest, data)
    except (OSError, ValueError, TypeError, OverflowError, RecursionError) as error:
        raise SourceUnavailable() from error


def owned(watcher):
    """Return an isolated parsed view. Never let a consumer mutate the parse cache."""
    prior = getattr(watcher, "_savedvars_source280", None)
    snapshot = read(watcher.sv_file, prior)
    watcher._savedvars_source280 = snapshot
    try:
        isolated = copy.deepcopy(snapshot.data)
    except (ValueError, TypeError, RecursionError) as error:
        raise SourceUnavailable() from error
    return Snapshot(snapshot.witness, snapshot.digest, isolated)

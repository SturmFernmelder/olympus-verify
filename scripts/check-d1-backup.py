#!/usr/bin/env python3
"""Check an explicitly supplied local D1 SQL export or SQLite backup.

Examples (from the repository root):
  python scripts/check-d1-backup.py worker/schema.sql --format sql
  python scripts/check-d1-backup.py /private/current-export.sql --live-catalogue /private/catalogue.json

The first command is schema-restore sanity, NOT a fresh production backup.
Nothing is downloaded, no credentials are discovered, and the input is never
opened for writing. SQL is restored only in a disposable temporary directory;
SQLite inputs and any WAL/SHM companions are copied there and opened read-only.

An optional current live catalogue contains {type,name,tbl_name,sql} rows from
sqlite_schema (including SQLite autoindexes). A plain array, {"objects": [...]},
or the ordinary D1 results envelope is accepted. Exact portable tuples are
compared, not historical hashes or universal object counts. D1's _cf_METADATA
objects are excluded from both catalogues; _cf_KV objects are excluded only
when forming the portable comparison. Thus a supplied 443/442 catalogue can be
verified without assuming every valid database always has those counts.
"""
from __future__ import annotations

import argparse
from contextlib import closing
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile
import time
from typing import Any


CATALOGUE_SQL = "SELECT type,name,tbl_name,sql FROM main.sqlite_schema ORDER BY type,name,tbl_name"
FIELDS = ("type", "name", "tbl_name", "sql")


class CheckFailed(Exception):
    def __init__(self, code: str, **details: Any) -> None:
        super().__init__(code)
        self.code = code
        self.details = details


def existing_file(value: Path, code: str) -> Path:
    try:
        path = value.resolve(strict=True)
        if not path.is_file():
            raise CheckFailed(code)
        return path
    except (OSError, RuntimeError) as error:
        raise CheckFailed(code) from error


def catalogue_rows(value: Any) -> list[dict[str, Any]]:
    """Unwrap only the documented local JSON formats, not arbitrary nested data."""
    if isinstance(value, dict):
        if "success" in value and value["success"] is not True:
            raise CheckFailed("catalogue_unconfirmed")
        for key in ("objects", "results", "result"):
            if key in value:
                return catalogue_rows(value[key])
        raise CheckFailed("catalogue_invalid")
    if not isinstance(value, list):
        raise CheckFailed("catalogue_invalid")
    if value and all(isinstance(row, dict) and "results" in row for row in value):
        result: list[dict[str, Any]] = []
        for packet in value:
            result.extend(catalogue_rows(packet))
        return catalogue_rows(result)
    rows: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for row in value:
        if not isinstance(row, dict) or not all(field in row for field in FIELDS):
            raise CheckFailed("catalogue_invalid")
        if row["type"] not in ("table", "index", "view", "trigger"):
            raise CheckFailed("catalogue_invalid")
        if any(not isinstance(row[field], str) or not row[field] for field in FIELDS[:3]):
            raise CheckFailed("catalogue_invalid")
        if row["sql"] is not None and not isinstance(row["sql"], str):
            raise CheckFailed("catalogue_invalid")
        key = (row["type"], row["name"])
        if key in seen:
            raise CheckFailed("catalogue_duplicate_object")
        seen.add(key)
        rows.append({field: row[field] for field in FIELDS})
    return rows


def belongs_to(row: dict[str, Any], table: str) -> bool:
    return row["name"] == table or row["tbl_name"] == table


def portable(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [row for row in rows if not belongs_to(row, "_cf_METADATA") and not belongs_to(row, "_cf_KV")]


def tuples(rows: list[dict[str, Any]]) -> set[tuple[Any, ...]]:
    return {tuple(row[field] for field in FIELDS) for row in rows}


def compare_catalogue(actual: list[dict[str, Any]], live: list[dict[str, Any]] | None) -> dict[str, Any]:
    actual_portable = portable(actual)
    result: dict[str, Any] = {
        "supplied": live is not None,
        "matched": None,
        "live_objects": None,
        "expected_portable_objects": None,
        "backup_portable_objects": len(actual_portable),
    }
    if live is None:
        return result
    live_objects = [row for row in live if not belongs_to(row, "_cf_METADATA")]
    expected = tuples(portable(live_objects))
    restored = tuples(actual_portable)
    result.update(live_objects=len(live_objects), expected_portable_objects=len(expected), matched=expected == restored)
    if expected != restored:
        # No SQL text, row data or schema defaults leave the checker.
        raise CheckFailed("catalogue_mismatch", catalogue=result, missing_objects=len(expected - restored), unexpected_objects=len(restored - expected))
    return result


def restore_authorizer(action: int, first: str | None, second: str | None, _database: str | None, _origin: str | None) -> int:
    # A supplied dump must not attach/create an external database (including
    # VACUUM INTO) or redirect temporary files outside our temporary directory.
    if action in (sqlite3.SQLITE_ATTACH, sqlite3.SQLITE_DETACH):
        return sqlite3.SQLITE_DENY
    if action == sqlite3.SQLITE_PRAGMA and (first or "").lower() in ("temp_store_directory", "data_store_directory", "writable_schema"):
        return sqlite3.SQLITE_DENY
    if action == sqlite3.SQLITE_FUNCTION and (second or "").lower() in ("load_extension", "readfile", "writefile"):
        return sqlite3.SQLITE_DENY
    return sqlite3.SQLITE_OK


def check_connection(connection: sqlite3.Connection, live: list[dict[str, Any]] | None) -> dict[str, Any]:
    # A dump's connection-local PRAGMAs must not suppress the actual checks.
    connection.execute("PRAGMA ignore_check_constraints=OFF")
    try:
        integrity = connection.execute("PRAGMA integrity_check").fetchall()
    except sqlite3.Error as error:
        raise CheckFailed("integrity_check_failed") from error
    if integrity != [("ok",)]:
        raise CheckFailed("integrity_check_failed", integrity_error_count=len(integrity))
    try:
        violations = sum(1 for _ in connection.execute("PRAGMA foreign_key_check"))
    except sqlite3.Error as error:
        raise CheckFailed("foreign_key_check_failed") from error
    if violations:
        raise CheckFailed("foreign_key_check_failed", foreign_key_violations=violations)
    rows = [dict(zip(FIELDS, row)) for row in connection.execute(CATALOGUE_SQL)]
    return {"integrity_check": "ok", "foreign_key_violations": 0, "catalogue": compare_catalogue(rows, live)}


def checked_copy(source: Path, destination: Path) -> None:
    before = source.stat()
    shutil.copyfile(source, destination)
    after = source.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise CheckFailed("backup_changed_during_read")


def check_backup(backup: Path, input_format: str, live: list[dict[str, Any]] | None) -> dict[str, Any]:
    if backup.stat().st_size == 0:
        raise CheckFailed("backup_empty")
    with backup.open("rb") as stream:
        header = stream.read(16)
    if input_format == "auto":
        input_format = "sqlite" if header == b"SQLite format 3\x00" or backup.suffix.lower() in (".db", ".sqlite", ".sqlite3") else "sql"
    with tempfile.TemporaryDirectory(prefix="olympus-d1-backup-") as directory:
        restored = Path(directory) / "restored.sqlite"
        sidecars: list[str] = []
        if input_format == "sqlite":
            checked_copy(backup, restored)
            for suffix in ("-wal", "-shm"):
                companion = Path(str(backup) + suffix)
                if companion.is_file():
                    checked_copy(companion, Path(str(restored) + suffix))
                    sidecars.append(suffix)
            # No immutable=1: that would silently ignore a committed WAL.
            with closing(sqlite3.connect(restored.as_uri() + "?mode=ro", uri=True)) as connection:
                connection.execute("PRAGMA query_only=ON")
                result = check_connection(connection, live)
        else:
            before = backup.stat()
            try:
                sql = backup.read_text(encoding="utf-8-sig")
            except UnicodeError as error:
                raise CheckFailed("sql_not_utf8") from error
            after = backup.stat()
            if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                raise CheckFailed("backup_changed_during_read")
            if not sql.strip():
                raise CheckFailed("backup_empty")
            with closing(sqlite3.connect(restored, isolation_level=None)) as connection:
                connection.execute("PRAGMA temp_store=MEMORY")
                connection.execute("PRAGMA foreign_keys=OFF")
                if hasattr(connection, "enable_load_extension"):
                    connection.enable_load_extension(False)
                connection.set_authorizer(restore_authorizer)
                try:
                    connection.executescript(sql)
                except (sqlite3.Error, ValueError) as error:
                    raise CheckFailed("sql_restore_failed") from error
                finally:
                    connection.set_authorizer(None)
                if connection.in_transaction:
                    raise CheckFailed("sql_transaction_unfinished")
                connection.execute("PRAGMA query_only=ON")
                result = check_connection(connection, live)
        return {"format": input_format, "input_bytes": backup.stat().st_size, "sqlite_sidecars_copied": sidecars, **result}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("backup", type=Path, help="Existing local SQL export or SQLite backup (never modified)")
    parser.add_argument("--format", choices=("auto", "sql", "sqlite"), default="auto")
    parser.add_argument("--live-catalogue", type=Path, help="Existing current-live sqlite_schema JSON for exact portable object parity")
    parser.add_argument("--sha256", action="store_true", help="Compute the supplied backup digest as evidence, never as an admission gate")
    args = parser.parse_args()
    started = time.perf_counter()
    try:
        backup = existing_file(args.backup, "backup_unreadable")
        live = None
        if args.live_catalogue:
            catalogue_file = existing_file(args.live_catalogue, "catalogue_unreadable")
            try:
                live = catalogue_rows(json.loads(catalogue_file.read_text(encoding="utf-8-sig")))
            except (UnicodeError, json.JSONDecodeError) as error:
                raise CheckFailed("catalogue_invalid") from error
        result = {"ok": True, "backup": str(backup), **check_backup(backup, args.format, live), "production_backup_provenance_claimed": False, "freshness_claimed": False, "source_writes": 0, "provider_requests": 0}
        if args.sha256:
            digest = hashlib.sha256()
            with backup.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
            result["sha256"] = digest.hexdigest()
    except CheckFailed as error:
        result = {"ok": False, "error": error.code, **error.details}
    except (OSError, sqlite3.Error):
        # Database diagnostics can contain SQL/data; do not print them.
        result = {"ok": False, "error": "backup_check_failed"}
    result["elapsed_seconds"] = time.perf_counter() - started
    print(json.dumps(result, sort_keys=True))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

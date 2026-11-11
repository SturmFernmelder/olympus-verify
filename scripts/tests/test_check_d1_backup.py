"""Exercise the backup checker's CLI against real, temporary SQLite and SQL.

These fixtures establish local backup readability, integrity and catalogue parity.
They never establish production provenance or contact a provider. Run this file
explicitly; authoring it does not execute the checker or any qualification tests.
"""

from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
CHECKER = ROOT / "scripts" / "check-d1-backup.py"

APPLICATION_SQL = """
CREATE TABLE parent (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL UNIQUE
);
CREATE TABLE child (
    id INTEGER PRIMARY KEY,
    parent_id INTEGER NOT NULL REFERENCES parent(id),
    note TEXT
);
CREATE INDEX child_parent ON child(parent_id);
CREATE VIEW joined_rows AS
    SELECT child.id, parent.label, child.note
    FROM child JOIN parent ON parent.id = child.parent_id;
CREATE TRIGGER child_requires_parent BEFORE INSERT ON child
WHEN NEW.parent_id IS NULL
BEGIN
    SELECT RAISE(ABORT, 'parent required');
END;
INSERT INTO parent(id, label) VALUES(1, 'fixture parent');
INSERT INTO child(id, parent_id, note) VALUES(1, 1, 'fixture child');
"""

# The ordinary object names deliberately cannot be filtered by a _cf_ prefix.
# Full sqlite_schema also includes autoindexes and sqlite_sequence.
PROVIDER_SQL = """
CREATE TABLE _cf_KV (key TEXT PRIMARY KEY, value TEXT);
CREATE INDEX provider_value_lookup ON _cf_KV(value);
CREATE TRIGGER provider_key_guard BEFORE INSERT ON _cf_KV
WHEN NEW.key IS NULL
BEGIN
    SELECT RAISE(ABORT, 'key required');
END;
CREATE TABLE _cf_METADATA (key TEXT PRIMARY KEY, value TEXT);
CREATE INDEX metadata_value_lookup ON _cf_METADATA(value);
"""


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def catalogue(path):
    with closing(sqlite3.connect(path)) as connection, connection:
        connection.row_factory = sqlite3.Row
        return [dict(row) for row in connection.execute(
            "SELECT type, name, tbl_name, sql FROM sqlite_schema "
            "ORDER BY type, name, tbl_name"
        )]


def belongs_to(row, table):
    return row["name"] == table or row["tbl_name"] == table


class CheckD1BackupTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="d1 backup contract ")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.incoming = self.root / "incoming"
        self.incoming.mkdir()
        self.serial = 0

    def next_path(self, suffix):
        self.serial += 1
        return self.incoming / ("backup-%d%s" % (self.serial, suffix))

    def database(self, extra_sql="", provider_objects=False):
        path = self.next_path(".sqlite")
        with closing(sqlite3.connect(path)) as connection, connection:
            connection.execute("PRAGMA foreign_keys = OFF")
            connection.executescript(
                APPLICATION_SQL + (PROVIDER_SQL if provider_objects else "") + extra_sql
            )
        return path

    def sql_backup(self, extra_sql="", provider_objects=False):
        path = self.next_path(".sql")
        path.write_text(
            APPLICATION_SQL + (PROVIDER_SQL if provider_objects else "") + extra_sql,
            encoding="utf-8",
        )
        return path

    def live_catalogue(self):
        live = self.database(provider_objects=True)
        rows = catalogue(live)
        path = self.next_path(".catalogue.json")
        path.write_text(json.dumps(rows), encoding="utf-8")
        return path, rows

    def invoke(self, backup, *arguments):
        process = subprocess.run(
            [sys.executable, "-I", "-B", str(CHECKER), str(backup), *arguments],
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            timeout=30,
            check=False,
        )
        try:
            result = json.loads(process.stdout)
        except json.JSONDecodeError as error:
            self.fail("CLI did not return one JSON document: %r; stderr=%r (%s)" % (
                process.stdout, process.stderr, error,
            ))
        self.assertIsInstance(result, dict)
        self.assertNotIn("Traceback", process.stderr)
        return process, result

    def accepted(self, backup, expected_format, *arguments):
        original = backup.read_bytes()
        process, result = self.invoke(backup, *arguments)
        self.assertEqual(process.returncode, 0, result)
        self.assertIs(result.get("ok"), True)
        self.assertEqual(result.get("format"), expected_format)
        self.assertEqual(result.get("integrity_check"), "ok")
        self.assertEqual(result.get("foreign_key_violations"), 0)
        self.assertIs(result.get("production_backup_provenance_claimed"), False)
        self.assertEqual(backup.read_bytes(), original, "the original backup was modified")
        return result

    def refused(self, backup, *arguments):
        original = backup.read_bytes() if backup.is_file() else None
        process, result = self.invoke(backup, *arguments)
        self.assertNotEqual(process.returncode, 0, result)
        self.assertIs(result.get("ok"), False)
        self.assertIsInstance(result.get("error"), str)
        self.assertRegex(result["error"], r"\A[A-Za-z][A-Za-z0-9_]{0,95}\Z")
        if original is not None:
            self.assertEqual(backup.read_bytes(), original, "refusal changed the original")
        return result

    def test_auto_detects_valid_sqlite_from_actual_header(self):
        backup = self.database()
        # Detection must use content, including when an operator has no extension.
        renamed = backup.with_suffix(".backup")
        backup.rename(renamed)
        result = self.accepted(renamed, "sqlite")
        self.assertIs(result["catalogue"]["supplied"], False)

    def test_auto_detects_valid_sql(self):
        result = self.accepted(self.sql_backup(), "sql")
        self.assertIs(result["catalogue"]["supplied"], False)

    def test_explicit_sqlite_and_sql_formats(self):
        for format_name, make in (("sqlite", self.database), ("sql", self.sql_backup)):
            with self.subTest(format=format_name):
                self.accepted(make(), format_name, "--format", format_name)

    def test_sha256_is_of_unchanged_original_bytes(self):
        for format_name, make in (("sqlite", self.database), ("sql", self.sql_backup)):
            with self.subTest(format=format_name):
                backup = make()
                expected = digest(backup)
                result = self.accepted(backup, format_name, "--sha256")
                self.assertEqual(result["sha256"], expected)

    def test_real_sqlite_foreign_key_violation_is_refused(self):
        backup = self.database(
            "INSERT INTO child(id,parent_id,note) VALUES(2,404,'orphan');"
        )
        with closing(sqlite3.connect(backup)) as connection, connection:
            self.assertEqual(connection.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertEqual(len(connection.execute("PRAGMA foreign_key_check").fetchall()), 1)
        self.refused(backup)

    def test_real_sql_foreign_key_violation_is_refused(self):
        backup = self.sql_backup(
            "INSERT INTO child(id,parent_id,note) VALUES(2,404,'orphan');"
        )
        # Prove this is an actual FK violation in valid SQL, not a syntax failure.
        with closing(sqlite3.connect(":memory:")) as connection, connection:
            connection.execute("PRAGMA foreign_keys = OFF")
            connection.executescript(backup.read_text(encoding="utf-8"))
            self.assertEqual(len(connection.execute("PRAGMA foreign_key_check").fetchall()), 1)
        self.refused(backup)

    def test_corrupt_non_sqlite_binary_is_refused(self):
        backup = self.next_path(".sqlite")
        backup.write_bytes(b"not a database\x00\xff\xfe\x01")
        self.refused(backup, "--format", "sqlite")

    def test_truncated_sqlite_header_and_pages_are_refused(self):
        original = self.database().read_bytes()
        for length in (16, 100, len(original) // 2):
            with self.subTest(length=length):
                backup = self.next_path(".sqlite")
                backup.write_bytes(original[:length])
                self.refused(backup, "--format", "sqlite")

    def test_malformed_sql_is_refused(self):
        self.refused(self.sql_backup("THIS IS NOT SQL;"), "--format", "sql")

    def test_truncated_sql_statement_is_refused(self):
        self.refused(self.sql_backup("INSERT INTO child(id, parent_id, note) VALUES(2,"))

    def test_missing_path_is_refused_without_creating_it(self):
        missing = self.next_path(".missing")
        self.refused(missing)
        self.assertFalse(missing.exists())

    def test_directory_is_not_a_backup(self):
        directory = self.incoming / "not-a-file"
        directory.mkdir()
        self.refused(directory)
        self.assertEqual(list(directory.iterdir()), [])

    def test_empty_file_is_not_a_valid_empty_database(self):
        backup = self.next_path(".sqlite")
        backup.write_bytes(b"")
        self.refused(backup)

    def test_full_live_catalogue_matches_portable_sqlite_and_sql(self):
        live_path, rows = self.live_catalogue()
        self.assertTrue(any(row["name"] == "sqlite_sequence" for row in rows))
        self.assertTrue(any(row["sql"] is None for row in rows))
        self.assertTrue(any(row["type"] == "trigger" for row in rows))
        live_rows = [row for row in rows if not belongs_to(row, "_cf_METADATA")]
        portable_rows = [row for row in live_rows if not belongs_to(row, "_cf_KV")]
        for format_name, make in (("sqlite", self.database), ("sql", self.sql_backup)):
            with self.subTest(format=format_name):
                result = self.accepted(make(), format_name, "--live-catalogue", str(live_path))
                facts = result["catalogue"]
                self.assertIs(facts["supplied"], True)
                self.assertIs(facts["matched"], True)
                self.assertEqual(facts["live_objects"], len(live_rows))
                self.assertEqual(facts["expected_portable_objects"], len(portable_rows))
                self.assertEqual(facts["backup_portable_objects"], len(portable_rows))

    def test_provider_table_objects_are_omitted_by_owner_table_not_name_prefix(self):
        live_path, rows = self.live_catalogue()
        self.assertEqual(next(row for row in rows if row["name"] == "provider_value_lookup")["tbl_name"], "_cf_KV")
        self.assertEqual(next(row for row in rows if row["name"] == "provider_key_guard")["tbl_name"], "_cf_KV")
        self.assertEqual(next(row for row in rows if row["name"] == "metadata_value_lookup")["tbl_name"], "_cf_METADATA")
        # Both a full local copy and a portable export must compare the same app tuples.
        backup = self.database(provider_objects=True)
        result = self.accepted(backup, "sqlite", "--live-catalogue", str(live_path))
        expected = [row for row in rows if not belongs_to(row, "_cf_METADATA")
                    and not belongs_to(row, "_cf_KV")]
        self.assertEqual(result["catalogue"]["backup_portable_objects"], len(expected))

    def test_missing_application_table_is_refused(self):
        live_path, _ = self.live_catalogue()
        backup = self.database("DROP VIEW joined_rows; DROP TABLE child;")
        self.refused(backup, "--live-catalogue", str(live_path))

    def test_same_count_different_application_object_is_refused(self):
        live_path, rows = self.live_catalogue()
        backup = self.database("DROP INDEX child_parent; CREATE INDEX child_note ON child(note);")
        expected = [row for row in rows if not belongs_to(row, "_cf_METADATA")
                    and not belongs_to(row, "_cf_KV")]
        self.assertEqual(len(catalogue(backup)), len(expected), "fixture must defeat count-only comparison")
        self.refused(backup, "--live-catalogue", str(live_path))

    def test_same_names_and_count_but_changed_sql_is_refused(self):
        live_path, rows = self.live_catalogue()
        backup = self.database("DROP INDEX child_parent; CREATE INDEX child_parent ON child(note);")
        expected = [row for row in rows if not belongs_to(row, "_cf_METADATA")
                    and not belongs_to(row, "_cf_KV")]
        shape = lambda items: {(row["type"], row["name"], row["tbl_name"]) for row in items}
        self.assertEqual(shape(catalogue(backup)), shape(expected))
        self.refused(backup, "--live-catalogue", str(live_path))

    def test_incomplete_or_duplicate_live_catalogue_rows_are_refused(self):
        live_path, rows = self.live_catalogue()
        incomplete = [dict(row) for row in rows]
        del incomplete[0]["sql"]
        for value in (incomplete, rows + [dict(rows[0])]):
            with self.subTest(duplicate=len(value) > len(rows)):
                live_path.write_text(json.dumps(value), encoding="utf-8")
                self.refused(self.database(), "--live-catalogue", str(live_path))

    def test_missing_live_catalogue_is_refused(self):
        self.refused(self.database(), "--live-catalogue", str(self.next_path(".absent.json")))

    def test_sqlite_input_and_sidecar_files_remain_unchanged(self):
        backup = self.database()
        before = digest(backup)
        self.accepted(backup, "sqlite", "--sha256")
        self.assertEqual(digest(backup), before)
        self.assertFalse(Path(str(backup) + "-journal").exists())
        self.assertFalse(Path(str(backup) + "-wal").exists())
        with closing(sqlite3.connect(backup)) as connection, connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM child").fetchone()[0], 1)

    def test_sql_attach_cannot_create_an_outside_database(self):
        outside = self.root / "outside-restore" / "created.sqlite"
        outside.parent.mkdir()
        quoted = str(outside).replace("'", "''")
        backup = self.sql_backup(
            "ATTACH DATABASE '%s' AS outside; CREATE TABLE outside.leaked(value TEXT);" % quoted
        )
        self.refused(backup, "--format", "sql")
        self.assertFalse(outside.exists())
        self.assertEqual(list(outside.parent.iterdir()), [])

    def test_sql_attach_cannot_modify_an_existing_outside_database(self):
        outside = self.root / "outside-existing.sqlite"
        with closing(sqlite3.connect(outside)) as connection, connection:
            connection.executescript("CREATE TABLE sentinel(value TEXT); INSERT INTO sentinel VALUES('untouched');")
        before = outside.read_bytes()
        quoted = str(outside).replace("'", "''")
        backup = self.sql_backup(
            "ATTACH DATABASE '%s' AS outside; UPDATE outside.sentinel SET value='changed';" % quoted
        )
        self.refused(backup, "--format", "sql")
        self.assertEqual(outside.read_bytes(), before)
        self.assertFalse(Path(str(outside) + "-journal").exists())

    def test_sql_vacuum_into_cannot_write_outside_restore(self):
        outside = self.root / "outside-vacuum.sqlite"
        quoted = str(outside).replace("'", "''")
        backup = self.sql_backup("VACUUM INTO '%s';" % quoted)
        self.refused(backup, "--format", "sql")
        self.assertFalse(outside.exists())


if __name__ == "__main__":
    unittest.main()

"""Synthetic private custody files only; no configuration, provider or real client."""
from __future__ import annotations

import copy
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import custody_recovery as recovery


class AttendedQuarantineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.path = self.root / "state.json"
        self.rows = [self.original("/ingest/verify", 0), self.original("/ingest/events", 1),
                     self.original("/ingest/roster", 2)]
        self.state = {"outbox": self.rows, "seen": ["retired-proof-claim", "other-claim"],
                      "queue_written_pending": [7], "queue_written_original": {"opaque": "unchanged"},
                      "worker_retry_at": 123456, "worker_retry_status": 401,
                      "chat_offset": 77, "roster_sent": 11,
                      "other": {"privateFinancialState": "do not duplicate", "nested": [1, None, False]}}
        self.save(self.state)

    def tearDown(self):
        self.tmp.cleanup()

    @staticmethod
    def original(path, position):
        if path == "/ingest/verify":
            body = {"character": "SYNTHETIC PRIVATE Æ", "code": "ABCDEF", "ts": position + 1,
                    "source": "whisper", "nativeMembership": {"observedAt": position + 1}}
        elif path == "/ingest/events":
            body = {"events": [{"type": "note", "name": "SYNTHETIC PRIVATE", "ts": position + 1,
                                "detail": "A free-text donation mention is not financial structure"}]}
        else:
            body = {"members": [{"name": "SYNTHETIC PRIVATE", "guid": "Player-1-ABCD"}],
                    "exportedAt": position + 1, "source": "addon"}
        row = {"path": path, "body": body, "label": "synthetic", "at": position + 1,
               "custody": 1, "binding": "a" * 64}
        row["digest"] = recovery.digest(json.dumps([row["path"], row["body"], row["at"], row["binding"]],
                                                  allow_nan=False).encode())
        return row

    def save(self, state):
        self.path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    def pins(self):
        inspected = recovery.inspect(self.path)
        q = inspected["quarantineUnknown"]
        return inspected["stateSha256"], q["manifestSha256"], q["count"]

    def quarantine(self, pins=None):
        state_sha, manifest_sha, count = pins or self.pins()
        return recovery.quarantine_unknown(self.path, state_sha, manifest_sha, count,
                                           "Synthetic attended unresolved-original review")

    def archives(self):
        return list(self.root.glob("state.json.custody-quarantine-*.json"))

    def test_preview_is_payload_free_and_does_not_change_state(self):
        before = self.path.read_bytes()
        output = recovery.inspect(self.path)
        q = output["quarantineUnknown"]
        self.assertTrue(q["eligible"])
        self.assertEqual(q["count"], 3)
        self.assertEqual(q["pathCounts"], {"/ingest/verify": 1, "/ingest/events": 1, "/ingest/roster": 1})
        self.assertEqual(len(q["manifestSha256"]), 64)
        self.assertNotIn("SYNTHETIC PRIVATE", json.dumps(output))
        self.assertNotIn("ABCDEF", json.dumps(output))
        self.assertNotIn("privateFinancialState", json.dumps(output))
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(self.archives(), [])

    def test_whole_box_quarantine_preserves_order_claims_and_every_other_field(self):
        before = self.path.read_bytes()
        state_sha, manifest_sha, _ = self.pins()
        with patch.object(recovery.time, "time", return_value=1000):
            result = self.quarantine()
        after = json.loads(self.path.read_bytes())
        self.assertEqual(after, {**self.state, "outbox": []})
        self.assertEqual(after["seen"], ["retired-proof-claim", "other-claim"])
        archive = json.loads(Path(result["archive"]).read_bytes())
        self.assertEqual(archive["originals"], self.rows)
        self.assertEqual(archive["beforeStateSha256"], hashlib.sha256(before).hexdigest())
        self.assertEqual(archive["beforeStateSha256"], state_sha)
        self.assertEqual(archive["afterStateSha256"], hashlib.sha256(self.path.read_bytes()).hexdigest())
        self.assertEqual(archive["manifestSha256"], manifest_sha)
        self.assertEqual([r["index"] for r in archive["manifest"]["items"]], [0, 1, 2])
        self.assertEqual([r["itemSha256"] for r in archive["manifest"]["items"]],
                         [recovery.item_digest(row) for row in self.rows])
        self.assertEqual(archive["action"], "quarantined-unresolved")
        self.assertEqual(archive["purpose"], "attended-recovery")
        self.assertEqual(archive["createdAt"], 1000)
        self.assertEqual(archive["reviewBy"], 87400)
        for metadata in [result, archive]:
            self.assertEqual(metadata["outcome"], "unknown")
            self.assertFalse(metadata["network"])
            self.assertFalse(metadata["replayed"])
            self.assertFalse(metadata["deliveryAcknowledged"])
            self.assertFalse(metadata["dispatchAuthority"])
        # The archive is not a second copy of unrelated state or a dispatch file.
        self.assertNotIn("outbox", archive)
        self.assertNotIn("beforeStateRaw", archive)
        self.assertNotIn("privateFinancialState", json.dumps(archive))
        self.assertEqual(result["quarantinedCount"], 3)

    def test_actual_backlog_size_is_one_pinned_selection_not_429_replays(self):
        rows = ([self.original("/ingest/verify", i) for i in range(75)]
                + [self.original("/ingest/events", i + 75) for i in range(351)]
                + [self.original("/ingest/roster", i + 426) for i in range(3)])
        self.save({**self.state, "outbox": rows})
        q = recovery.inspect(self.path)["quarantineUnknown"]
        self.assertEqual(q["count"], 429)
        self.assertEqual(q["pathCounts"], {"/ingest/verify": 75, "/ingest/events": 351, "/ingest/roster": 3})
        result = self.quarantine()
        self.assertEqual(result["quarantinedCount"], 429)
        self.assertEqual(len(self.archives()), 1)
        self.assertEqual(json.loads(Path(result["archive"]).read_bytes())["originals"], rows)
        self.assertEqual(json.loads(self.path.read_bytes())["outbox"], [])

    def test_stale_state_manifest_or_count_cannot_mutate_or_archive(self):
        state_sha, manifest_sha, count = self.pins()
        before = self.path.read_bytes()
        for pins in [("0" * 64, manifest_sha, count), (state_sha, "0" * 64, count),
                     (state_sha, manifest_sha, count - 1), (state_sha, manifest_sha, 0),
                     (state_sha, manifest_sha, True)]:
            with self.subTest(pins=pins), self.assertRaises(ValueError):
                self.quarantine(pins)
            self.assertEqual(self.path.read_bytes(), before)
            self.assertEqual(self.archives(), [])

    def test_reordering_requires_a_new_manifest_even_with_the_new_state_hash(self):
        _, old_manifest, count = self.pins()
        self.save({**self.state, "outbox": list(reversed(self.rows))})
        before = self.path.read_bytes()
        with self.assertRaises(ValueError):
            self.quarantine((hashlib.sha256(before).hexdigest(), old_manifest, count))
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(self.archives(), [])

    def test_one_ineligible_record_refuses_the_entire_mixed_selection(self):
        changes = [lambda r: r.update(acknowledged=True), lambda r: r.update(acknowledged=0),
                   lambda r: r.update(refusal_status=400), lambda r: r.update(refusal_status=409),
                   lambda r: r.update(server_expired=True), lambda r: r.pop("custody"),
                   lambda r: r.update(custody=True), lambda r: r.update(path="/ingest/intake242"),
                   lambda r: r.update(body=[]),
                   lambda r: r["body"].update(donation={"copper": 15}),
                   lambda r: r["body"].update(entries=[{"type": "donation"}]),
                   lambda r: r["body"].update(source="tithe-gold-v2")]
        for change in changes:
            with self.subTest(change=change):
                rows = copy.deepcopy(self.rows)
                change(rows[1])
                # Some malformed structures retain a correct capture digest;
                # integrity alone must not make them an eligible ordinary lane.
                if "body" in rows[1] and "path" in rows[1]:
                    rows[1]["digest"] = recovery.digest(json.dumps([rows[1]["path"], rows[1]["body"],
                        rows[1]["at"], rows[1]["binding"]], allow_nan=False).encode())
                self.save({**self.state, "outbox": rows})
                before = self.path.read_bytes()
                self.assertFalse(recovery.inspect(self.path)["quarantineUnknown"]["eligible"])
                with self.assertRaises(ValueError):
                    self.quarantine((hashlib.sha256(before).hexdigest(), "a" * 64, 3))
                self.assertEqual(self.path.read_bytes(), before)
                self.assertEqual(self.archives(), [])

    def test_changed_digest_and_empty_box_are_refused(self):
        rows = copy.deepcopy(self.rows)
        rows[0]["digest"] = "0" * 64
        for box in [rows, []]:
            self.save({**self.state, "outbox": box})
            before = self.path.read_bytes()
            self.assertFalse(recovery.inspect(self.path)["quarantineUnknown"]["eligible"])
            with self.assertRaises(ValueError):
                self.quarantine((hashlib.sha256(before).hexdigest(), "a" * 64, max(1, len(box))))
            self.assertEqual(self.path.read_bytes(), before)

    def test_duplicate_keys_and_nonfinite_or_over_limit_state_are_refused(self):
        clean = self.path.read_bytes()
        for malformed in [b'{"outbox":[],"outbox":' + json.dumps(self.rows).encode() + b'}',
                          b'{"outbox":' + json.dumps(self.rows).encode() + b',"other":NaN}']:
            self.path.write_bytes(malformed)
            with self.assertRaises(ValueError):
                self.quarantine((hashlib.sha256(malformed).hexdigest(), "a" * 64, 3))
            self.assertEqual(self.path.read_bytes(), malformed)
        self.path.write_bytes(clean)
        pins = self.pins()
        with patch.object(recovery, "QUARANTINE_MAX_BYTES", len(clean) - 1), self.assertRaises(ValueError):
            self.quarantine(pins)
        self.assertEqual(self.path.read_bytes(), clean)
        self.assertEqual(self.archives(), [])

    def test_exponent_overflow_is_ineligible_in_preview_and_apply_before_archive(self):
        for nested, number in [(False, "1e309"), (True, "-1e309"), (True, "1E309")]:
            with self.subTest(nested=nested, number=number):
                state = {**self.state, "other": {"nested": ["OVERFLOW"]}} if nested else {**self.state, "overflow": "OVERFLOW"}
                raw = json.dumps(state).replace('"OVERFLOW"', number).encode()
                self.path.write_bytes(raw)
                preview = recovery.inspect(self.path)["quarantineUnknown"]
                self.assertFalse(preview["eligible"])
                self.assertIsNone(preview["manifestSha256"])
                with self.assertRaises(ValueError):
                    self.quarantine((hashlib.sha256(raw).hexdigest(), "a" * 64, 3))
                self.assertEqual(self.path.read_bytes(), raw)
                self.assertEqual(self.archives(), [])
        self.save({**self.state, "other": {"finite": 1.25}})
        self.assertTrue(recovery.inspect(self.path)["quarantineUnknown"]["eligible"])
        self.quarantine()
        self.assertEqual(json.loads(self.path.read_bytes())["other"], {"finite": 1.25})

    def test_oversized_preview_is_rejected_before_open_read_or_parse(self):
        before = self.path.read_bytes()
        with patch.object(recovery, "QUARANTINE_MAX_BYTES", 16), \
                patch.object(Path, "read_bytes", side_effect=AssertionError("unbounded state read")) as read, \
                patch.object(Path, "open", side_effect=AssertionError("oversized state opened")) as opened, \
                patch.object(recovery.json, "loads", side_effect=AssertionError("oversized state parsed")) as parsed:
            with self.assertRaises(ValueError):
                recovery.inspect(self.path)
            read.assert_not_called()
            opened.assert_not_called()
            parsed.assert_not_called()
        self.assertEqual(self.path.read_bytes(), before)

    def test_preview_read_is_bounded_if_file_grows_after_the_size_check(self):
        stat, opened = Path.stat, Path.open
        sizes = []
        class ReadScope:
            def __init__(self, stream):
                self.stream = stream
            def __enter__(self):
                self.stream.__enter__()
                return self
            def __exit__(self, *args):
                return self.stream.__exit__(*args)
            def read(self, size):
                sizes.append(size)
                return self.stream.read(size)
        def old_size(path, *args, **kwargs):
            info = stat(path, *args, **kwargs)
            if path == self.path:
                fields = list(info)
                fields[6] = 64
                return os.stat_result(fields)
            return info
        def bounded_open(path, *args, **kwargs):
            return ReadScope(opened(path, *args, **kwargs))
        with patch.object(recovery, "QUARANTINE_MAX_BYTES", 64), \
                patch.object(Path, "stat", new=old_size), patch.object(Path, "open", new=bounded_open), \
                patch.object(Path, "read_bytes", side_effect=AssertionError("unbounded state read")), \
                patch.object(recovery.json, "loads", side_effect=AssertionError("oversized state parsed")) as parsed:
            with self.assertRaises(ValueError):
                recovery.inspect(self.path)
            parsed.assert_not_called()
        self.assertEqual(sizes, [65])

    def test_archive_output_bound_and_review_counter_overflow_preserve_original(self):
        before = self.path.read_bytes()
        pins = self.pins()
        # Input is permitted, but its archive plus manifest does not fit.
        with patch.object(recovery, "QUARANTINE_MAX_BYTES", len(before)), self.assertRaises(ValueError):
            self.quarantine(pins)
        for at in [0, -1, 9007199254740991 - 86400 + 1]:
            with patch.object(recovery.time, "time", return_value=at), self.assertRaises(ValueError):
                self.quarantine(pins)
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(self.archives(), [])

    def test_occupied_writer_lease_never_changes_state(self):
        before, pins = self.path.read_bytes(), self.pins()
        with recovery.StateLease(self.path), self.assertRaises(FileExistsError):
            self.quarantine(pins)
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(self.archives(), [])

    def test_archive_write_failure_preserves_state_and_partial_archive_blocks_retry(self):
        before, pins = self.path.read_bytes(), self.pins()
        # Initialise the stable lease before injecting archive failure.
        with recovery.StateLease(self.path):
            pass
        with patch.object(recovery.os, "fsync", side_effect=OSError("synthetic archive fsync failure")), self.assertRaises(OSError):
            self.quarantine(pins)
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(len(self.archives()), 1)
        with self.assertRaises(FileExistsError):
            self.quarantine(pins)
        self.assertEqual(self.path.read_bytes(), before)

    def test_existing_archive_is_never_overwritten(self):
        state_sha, manifest_sha, _ = pins = self.pins()
        archive = self.path.with_name(self.path.name + ".custody-quarantine-" + state_sha + "-" + manifest_sha + ".json")
        archive.write_bytes(b"existing evidence")
        before = self.path.read_bytes()
        with self.assertRaises(FileExistsError):
            self.quarantine(pins)
        self.assertEqual(archive.read_bytes(), b"existing evidence")
        self.assertEqual(self.path.read_bytes(), before)

    def test_short_or_misreported_archive_and_temp_writes_never_replace_state(self):
        create = recovery.private_create
        class TruncatedStream:
            def __init__(self, stream, report_full):
                self.stream, self.report_full = stream, report_full
            def __enter__(self):
                self.stream.__enter__()
                return self
            def __exit__(self, *args):
                return self.stream.__exit__(*args)
            def write(self, data):
                count = self.stream.write(data[:-1])
                return len(data) if self.report_full else count
            def flush(self):
                return self.stream.flush()
            def fileno(self):
                return self.stream.fileno()
        for target, report_full in [("archive", False), ("archive", True), ("temp", False), ("temp", True)]:
            with self.subTest(target=target, report_full=report_full), tempfile.TemporaryDirectory() as folder:
                path = Path(folder) / "isolated-state.json"
                path.write_bytes(self.path.read_bytes())
                pins = recovery.inspect(path)
                before = path.read_bytes()
                def truncated_create(given):
                    stream = create(given)
                    selected = ".custody-quarantine-" in given.name if target == "archive" else given.name.endswith(".tmp")
                    return TruncatedStream(stream, report_full) if selected else stream
                with patch.object(recovery, "private_create", side_effect=truncated_create), self.assertRaises((OSError, ValueError)):
                    recovery.quarantine_unknown(path, pins["stateSha256"],
                        pins["quarantineUnknown"]["manifestSha256"], 3, "Synthetic attended partial-write review")
                self.assertEqual(path.read_bytes(), before)

    def test_state_change_after_archive_stops_before_replace(self):
        before, pins = self.path.read_bytes(), self.pins()
        create = recovery.private_create
        def changed_create(path):
            stream = create(path)
            if ".custody-quarantine-" in path.name:
                self.path.write_bytes(before + b" ")
            return stream
        with patch.object(recovery, "private_create", side_effect=changed_create), self.assertRaises(ValueError):
            self.quarantine(pins)
        self.assertEqual(self.path.read_bytes(), before + b" ")
        self.assertEqual(len(self.archives()), 1)
        self.assertFalse(self.path.with_name("state.json.custody-recovery.tmp").exists())

    def test_replace_failure_preserves_original_archive_and_refuses_blind_repeat(self):
        before, pins = self.path.read_bytes(), self.pins()
        with patch.object(recovery.os, "replace", side_effect=OSError("synthetic replace failure")), self.assertRaises(OSError):
            self.quarantine(pins)
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(json.loads(self.archives()[0].read_bytes())["originals"], self.rows)
        self.assertTrue(self.path.with_name("state.json.custody-recovery.tmp").exists())
        with self.assertRaises(FileExistsError):
            self.quarantine(pins)

    def test_state_change_during_temp_write_is_not_overwritten(self):
        before, pins = self.path.read_bytes(), self.pins()
        create = recovery.private_create
        def changed_create(path):
            stream = create(path)
            if path.name.endswith(".custody-recovery.tmp"):
                self.path.write_bytes(before + b" ")
            return stream
        with patch.object(recovery, "private_create", side_effect=changed_create), self.assertRaises(ValueError):
            self.quarantine(pins)
        self.assertEqual(self.path.read_bytes(), before + b" ")
        self.assertEqual(len(self.archives()), 1)

    def test_error_after_actual_replace_leaves_archive_and_committed_state_for_review(self):
        pins = self.pins()
        replace = os.replace
        def lost_result(source, target):
            replace(source, target)
            raise OSError("synthetic lost local result")
        with patch.object(recovery.os, "replace", side_effect=lost_result), self.assertRaises(OSError):
            self.quarantine(pins)
        self.assertEqual(json.loads(self.path.read_bytes()), {**self.state, "outbox": []})
        archive_before = self.archives()[0].read_bytes()
        with self.assertRaises(ValueError):
            self.quarantine(pins)
        self.assertEqual(self.archives()[0].read_bytes(), archive_before)

    def test_failed_readback_is_not_a_success_and_is_not_automatically_repeated(self):
        pins = self.pins()
        read = recovery._read_state
        reads = 0
        def lost_readback(path, max_bytes=None):
            nonlocal reads
            if path == self.path:
                reads += 1
                if reads == 4:
                    raise OSError("synthetic unreadable replacement")
            return read(path, max_bytes)
        with patch.object(recovery, "_read_state", new=lost_readback), self.assertRaises(OSError):
            self.quarantine(pins)
        self.assertEqual(json.loads(self.path.read_bytes())["outbox"], [])
        self.assertEqual(len(self.archives()), 1)
        with self.assertRaises(ValueError):
            self.quarantine(pins)

    def test_restarted_empty_box_does_not_dispatch_archive_files(self):
        result = self.quarantine()
        (self.root / "Logs").mkdir()
        import watcher
        w = watcher.Watcher({"worker_url": "https://example.invalid", "watcher_token": "synthetic-only",
                             "verify_secret": "synthetic-secret", "wow_dir": str(self.root), "account": "SYNTHETIC",
                             "officer_character": "Synthetic", "state_file": str(self.path), "max_outbox": 500})
        with patch.object(w.worker, "call", side_effect=AssertionError("must not dispatch archived originals")):
            w.flush_outbox()
        self.assertEqual(w.state.d["outbox"], [])
        self.assertEqual(w.state.d["seen"], self.state["seen"])
        self.assertEqual(json.loads(Path(result["archive"]).read_bytes())["originals"], self.rows)

    def test_reobserved_signed_chat_and_savedvars_proof_stay_deduplicated_after_quarantine(self):
        # Reuse the existing real parser/native file/roster-ACK fixture rather
        # than installing private internal witnesses or bypassing admission.
        import test_verification_source_witness280 as native_fixture
        import watcher
        fixture = native_fixture.VerificationSourceWitness280Tests(methodName="runTest")
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        fixture.admit()
        old_line, old_body = fixture.line(), fixture.body()
        fixture.unknown_verify = True
        fixture.w.handle_chat_line(old_line)
        self.assertEqual(len(fixture.verify_paths()), 1)
        self.assertEqual(len(fixture.w.state.d["outbox"]), 1)
        path = fixture.w.state.path
        pins = recovery.inspect(path)
        result = recovery.quarantine_unknown(path, pins["stateSha256"],
            pins["quarantineUnknown"]["manifestSha256"], 1, "Synthetic original proof re-observation review")
        archive = Path(result["archive"]).read_bytes()
        restarted = watcher.Watcher(fixture.w.cfg)
        calls = []
        def transport(method, route, body=None, retries=3):
            calls.append((method, route))
            if route == "/ingest/roster":
                return True, {"snapshot": 8, "trusted": True, "members": len(body["members"])}
            raise AssertionError("old proof was dispatched after quarantine")
        restarted.worker.call = transport
        fixture.at += 1
        fixture.db["roster"]["exportedAt"] = fixture.at
        fixture.write()
        restarted.check_savedvars()
        self.assertTrue(restarted.verification_roster_ready(old_body))
        self.assertTrue(restarted.state.was_seen(restarted.code_key("w", native_fixture.NAME, fixture.code)))
        restarted.handle_chat_line(old_line)
        restarted.forward_events([{"type": "whisper", "name": native_fixture.NAME, "guid": native_fixture.GUID,
                                   "code": fixture.code, "ok": True, "ts": old_body["ts"],
                                   "nativeMembership": old_body["nativeMembership"]}])
        self.assertEqual(calls, [("POST", "/ingest/roster")])
        self.assertEqual(restarted.state.d["outbox"], [])
        self.assertEqual(Path(result["archive"]).read_bytes(), archive)

    def test_cli_runs_without_network_or_watcher_imports_and_rejects_queue_lane(self):
        script = Path(recovery.__file__).resolve()
        code = """import builtins,runpy,sys
original=builtins.__import__
def closed(name,*args,**kwargs):
 if name.split('.')[0] in {'socket','urllib','http','watcher'}: raise AssertionError('network or Watcher import')
 return original(name,*args,**kwargs)
builtins.__import__=closed
sys.argv=[sys.argv[1],*sys.argv[2:]]
runpy.run_path(sys.argv[0],run_name='__main__')
"""
        result = subprocess.run([sys.executable, "-I", "-c", code, str(script), "--state", str(self.path), "inspect"],
                                capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(json.loads(result.stdout)["quarantineUnknown"]["eligible"])
        before = self.path.read_bytes()
        state_sha, manifest_sha, count = self.pins()
        result = subprocess.run([sys.executable, str(script), "--state", str(self.path), "quarantine-unknown",
                                 "--lane", "queue-written", "--state-sha256", state_sha,
                                 "--manifest-sha256", manifest_sha, "--count", str(count),
                                 "--reason", "Synthetic attended review"], capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 2)
        self.assertNotIn("SYNTHETIC PRIVATE", result.stdout + result.stderr)
        self.assertEqual(self.path.read_bytes(), before)
        result = subprocess.run([sys.executable, "-I", "-c", code, str(script), "--state", str(self.path),
                                 "quarantine-unknown", "--state-sha256", state_sha, "--manifest-sha256", manifest_sha,
                                 "--count", str(count), "--reason", "Synthetic attended offline review"],
                                capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        response = json.loads(result.stdout)
        self.assertEqual(response["action"], "quarantined-unresolved")
        self.assertEqual(response["outcome"], "unknown")
        self.assertFalse(response["network"])
        self.assertFalse(response["replayed"])
        self.assertNotIn("SYNTHETIC PRIVATE", result.stdout + result.stderr)
        self.assertEqual(json.loads(self.path.read_bytes())["outbox"], [])


if __name__ == "__main__":
    unittest.main()

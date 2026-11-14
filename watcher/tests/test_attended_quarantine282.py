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
                      "chat_offset": 77, "chat_fp": "opaque-chat-fingerprint", "roster_sent": 11,
                      "sv_mtime": 1234567.125,
                      "tickets": {"opaque-ticket-digest": ["Synthetic Holder", 1234567]},
                      "identities": {"synthetic holder": ["Player-1-ABCDEF12", 1234567]},
                      "future_opaque": {"nested": [None, False, 0, "é", {"untouched": [1, 2, 3]}]},
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

    @staticmethod
    def unchecked_pins(raw):
        # Intentionally independent of the production eligibility/strict parser:
        # a correct pin must not mask the particular guard under test.
        rows = json.loads(raw)["outbox"]
        manifest = {"schema": "watcher-unresolved-manifest-v1", "count": len(rows), "items": [
            {"index": index, "path": row["path"], "itemSha256": hashlib.sha256(
                json.dumps(row, sort_keys=True, allow_nan=False, separators=(",", ":")).encode()).hexdigest()}
            for index, row in enumerate(rows)]}
        return (hashlib.sha256(raw).hexdigest(), hashlib.sha256(json.dumps(
            manifest, sort_keys=True, allow_nan=False, separators=(",", ":")).encode()).hexdigest(), len(rows))

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
        for field in ("tickets", "identities", "chat_fp", "sv_mtime", "future_opaque"):
            self.assertEqual(after[field], self.state[field])
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
                   lambda r: r.update(body=[]), lambda r: r.update(at=0),
                   lambda r: r.update(at=True), lambda r: r.update(binding="invalid"),
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
                    recovery._quarantine_manifest(json.loads(before))
                with self.assertRaises(ValueError):
                    self.quarantine(self.unchecked_pins(before))
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
                recovery._quarantine_manifest(json.loads(before))
            pins = self.unchecked_pins(before)
            with self.assertRaises(ValueError):
                self.quarantine((pins[0], pins[1], max(1, len(box))))
            self.assertEqual(self.path.read_bytes(), before)
            self.assertEqual(self.archives(), [])

    def test_strict_json_guards_cannot_hide_behind_manifest_or_later_serialization(self):
        clean = self.path.read_bytes()
        # Corrupt only unrelated state. Every outbox row and its real ordered
        # manifest remain valid, including for NaN that later serialization
        # would also refuse if the strict parser were accidentally removed.
        body = json.dumps(self.state).encode()
        cases = [body[:-1] + b',"metadata":1,"metadata":2}',
                 body[:-1] + b',"metadata":{"nested":1,"nested":2}}',
                 body[:-1] + b',"metadata":NaN}',
                 body[:-1] + b',"metadata":Infinity}',
                 body[:-1] + b',"metadata":-Infinity}',
                 body[:-1] + b',"metadata":1e309}',
                 body[:-1] + b',"metadata":{"nested":[-1e309]}}',
                 body[:-1] + b',"metadata":{"nested":[1E309]}}']
        for raw in cases:
            with self.subTest(raw=raw[-50:]):
                self.path.write_bytes(raw)
                pins = self.unchecked_pins(raw)
                preview = recovery.inspect(self.path)["quarantineUnknown"]
                self.assertFalse(preview["eligible"])
                self.assertIsNone(preview["manifestSha256"])
                with self.assertRaises(ValueError):
                    recovery._strict_quarantine_state(raw)
                # Must stop before eligibility. An overflow refused much later
                # by allow_nan=False does not prove strict parsing happened.
                with patch.object(recovery, "_quarantine_manifest", side_effect=AssertionError("strict parser bypassed")) as reached:
                    with self.assertRaises(ValueError):
                        self.quarantine(pins)
                    reached.assert_not_called()
                self.assertEqual(self.path.read_bytes(), raw)
                self.assertEqual(self.archives(), [])
        self.path.write_bytes(clean)
        pins = self.pins()
        with patch.object(recovery, "QUARANTINE_MAX_BYTES", len(clean) - 1), self.assertRaises(ValueError):
            self.quarantine(pins)
        self.assertEqual(self.path.read_bytes(), clean)
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
            # Older pathlib implements lstat via stat(follow_symlinks=False).
            # Preserve real Windows reparse attributes for the identity check.
            if path == self.path and kwargs.get("follow_symlinks", True):
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
        # Keep only the selected rows here: this input fits while the archive
        # adds its manifest/review metadata, independent of other fixture fields.
        self.path.write_bytes(json.dumps({"outbox": self.rows}, separators=(",", ":")).encode())
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

    def test_unknown_outcome_cannot_use_legacy_ack_settlement_with_correct_pins(self):
        for row in self.rows:
            with self.subTest(path=row["path"]):
                self.save({**self.state, "outbox": [row]})
                before = self.path.read_bytes()
                pins = recovery.inspect(self.path)
                self.assertEqual(pins["outbox"]["classification"], "unknown-outcome-held")
                with self.assertRaises(ValueError):
                    recovery.recover(self.path, "outbox", "settle-acknowledged", pins["stateSha256"],
                                     pins["outbox"]["itemSha256"], "Synthetic unknown outcome must stay held")
                self.assertEqual(self.path.read_bytes(), before)
                self.assertEqual(list(self.root.glob("*.custody-archive-*.json")), [])
                self.assertEqual(self.archives(), [])
                self.assertFalse(self.path.with_name(self.path.name + ".custody-recovery.tmp").exists())

    def test_private_protection_rejects_actual_broad_inherited_and_wrong_dacls(self):
        # Zero-data scratch files only. Each Windows case is CREATED with its
        # descriptor, exactly as private_create does: SetNamedSecurityInfo adds
        # AI to an otherwise correct DACL and would mask the ACE under test.
        if os.name != "nt":
            path = self.root / "zero-data"
            with recovery.private_create(path):
                pass
            self.assertEqual(recovery.private_protection(path), "posix-owner-only")
            for mode in (0o640, 0o604, 0o660):
                with self.subTest(mode=mode):
                    path.chmod(mode)
                    with self.assertRaises(ValueError):
                        recovery.private_protection(path)
                    self.assertEqual(path.read_bytes(), b"")
            path.chmod(0o600)
            return
        import ctypes
        from ctypes import wintypes
        class SecurityAttributes(ctypes.Structure):
            _fields_ = [("nLength", wintypes.DWORD), ("lpSecurityDescriptor", wintypes.LPVOID),
                        ("bInheritHandle", wintypes.BOOL)]
        advapi = ctypes.WinDLL("advapi32", use_last_error=True)
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        convert = advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW
        convert.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.POINTER(wintypes.LPVOID),
                            ctypes.POINTER(wintypes.DWORD)]
        convert.restype = wintypes.BOOL
        create_file = kernel.CreateFileW
        create_file.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                                ctypes.POINTER(SecurityAttributes), wintypes.DWORD,
                                wintypes.DWORD, wintypes.HANDLE]
        create_file.restype = wintypes.HANDLE
        create_directory = kernel.CreateDirectoryW
        create_directory.argtypes = [wintypes.LPCWSTR, ctypes.POINTER(SecurityAttributes)]
        create_directory.restype = wintypes.BOOL
        get_security = advapi.GetNamedSecurityInfoW
        get_security.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                                wintypes.LPVOID, wintypes.LPVOID, ctypes.POINTER(wintypes.LPVOID),
                                wintypes.LPVOID, ctypes.POINTER(wintypes.LPVOID)]
        get_security.restype = wintypes.DWORD
        to_text = advapi.ConvertSecurityDescriptorToStringSecurityDescriptorW
        to_text.argtypes = [wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD,
                           ctypes.POINTER(wintypes.LPWSTR), ctypes.POINTER(wintypes.DWORD)]
        to_text.restype = wintypes.BOOL
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        kernel.CloseHandle.restype = wintypes.BOOL
        kernel.LocalFree.argtypes = [wintypes.LPVOID]
        kernel.LocalFree.restype = wintypes.LPVOID
        def created_with(path, sddl, directory=False):
            descriptor = wintypes.LPVOID()
            self.assertTrue(convert(sddl, 1, ctypes.byref(descriptor), None))
            try:
                attrs = SecurityAttributes(ctypes.sizeof(SecurityAttributes), descriptor, False)
                if directory:
                    self.assertTrue(create_directory(str(path), ctypes.byref(attrs)))
                else:
                    handle = create_file(str(path), 0x40000000, 0, ctypes.byref(attrs), 1, 0x80, None)
                    self.assertNotEqual(handle, wintypes.HANDLE(-1).value)
                    self.assertTrue(kernel.CloseHandle(handle))
            finally:
                kernel.LocalFree(descriptor)
        def actual_sddl(path):
            descriptor, dacl, text = wintypes.LPVOID(), wintypes.LPVOID(), wintypes.LPWSTR()
            self.assertEqual(get_security(str(path), 1, 0x4, None, None, ctypes.byref(dacl),
                                          None, ctypes.byref(descriptor)), 0)
            try:
                self.assertTrue(to_text(descriptor, 1, 0x4, ctypes.byref(text), None))
                return text.value
            finally:
                if text:
                    kernel.LocalFree(text)
                kernel.LocalFree(descriptor)
        control = "D:P(A;;FA;;;SY)(A;;FA;;;OW)"
        # This parent has no inheritable ACEs, so the unprotected negative
        # differs only in its protection flag, not in extra parent principals.
        parent = self.root / "zero-data-acl-parent"
        created_with(parent, control, directory=True)
        cases = [("exact", control, True),
                 ("broad", "D:P(A;;FA;;;SY)(A;;FA;;;OW)(A;;FR;;;WD)", False),
                 ("missing-system", "D:P(A;;FA;;;OW)", False),
                 ("inherited", "D:(A;;FA;;;SY)(A;;FA;;;OW)", False)]
        for name, sddl, accepted in cases:
            with self.subTest(dacl=name):
                path = parent / name
                created_with(path, sddl)
                actual = actual_sddl(path)
                if name == "inherited":
                    self.assertIn(actual, (sddl, sddl.replace("D:", "D:AI", 1)))
                else:
                    self.assertEqual(actual, sddl)  # no PAI masking another defect
                if accepted:
                    self.assertEqual(recovery.private_protection(path), "windows-protected-owner-system")
                else:
                    with self.assertRaises(ValueError):
                        recovery.private_protection(path)
                self.assertEqual(path.read_bytes(), b"")

    def test_same_size_archive_corruption_stops_before_state_replacement(self):
        before, pins = self.path.read_bytes(), self.pins()
        create = recovery.private_create
        corrupted = []
        class CorruptAfterClose:
            def __init__(self, stream, path):
                self.stream, self.path = stream, path
            def __enter__(self):
                return self.stream.__enter__()
            def __exit__(self, *args):
                result = self.stream.__exit__(*args)
                original = self.path.read_bytes()
                raw = bytearray(original)
                raw[raw.index(b'"unknown"') + 1] ^= 1
                self.path.write_bytes(raw)
                corrupted.append((original, bytes(raw)))
                return result
        def corrupt_create(path):
            stream = create(path)
            return CorruptAfterClose(stream, path) if ".custody-quarantine-" in path.name else stream
        with patch.object(recovery, "private_create", side_effect=corrupt_create), \
                patch.object(recovery.os, "replace", side_effect=AssertionError("corrupt archive reached replacement")) as replaced:
            with self.assertRaises(ValueError) as held:
                self.quarantine(pins)
            replaced.assert_not_called()
        self.assertEqual(held.exception.custody_phase, "archive-started")
        self.assertEqual(len(corrupted), 1)
        original, corrupt = corrupted[0]
        self.assertEqual(len(original), len(corrupt))
        self.assertEqual(sum(a != b for a, b in zip(original, corrupt)), 1)
        self.assertEqual(self.archives()[0].read_bytes(), corrupt)
        self.assertEqual(self.path.read_bytes(), before)
        self.assertFalse(self.path.with_name(self.path.name + ".custody-recovery.tmp").exists())

    def test_same_size_temporary_state_corruption_stops_before_replacement(self):
        before, pins = self.path.read_bytes(), self.pins()
        create, corrupted = recovery.private_create, []
        class CorruptAfterClose:
            def __init__(self, stream, path):
                self.stream, self.path = stream, path
            def __enter__(self):
                return self.stream.__enter__()
            def __exit__(self, *args):
                result = self.stream.__exit__(*args)
                original = self.path.read_bytes()
                raw = bytearray(original)
                raw[raw.index(b'"outbox"') + 1] ^= 1
                self.path.write_bytes(raw)
                corrupted.append((original, bytes(raw)))
                return result
        def corrupt_create(path):
            stream = create(path)
            return CorruptAfterClose(stream, path) if path.name.endswith(".custody-recovery.tmp") else stream
        with patch.object(recovery, "private_create", side_effect=corrupt_create), \
                patch.object(recovery.os, "replace", side_effect=AssertionError("corrupt replacement reached replace")) as replaced:
            with self.assertRaises(ValueError) as held:
                self.quarantine(pins)
            replaced.assert_not_called()
        self.assertEqual(held.exception.custody_phase, "archive-verified")
        self.assertEqual(len(corrupted), 1)
        original, corrupt = corrupted[0]
        self.assertEqual(len(original), len(corrupt))
        self.assertEqual(sum(a != b for a, b in zip(original, corrupt)), 1)
        tmp = self.path.with_name(self.path.name + ".custody-recovery.tmp")
        self.assertEqual(tmp.read_bytes(), corrupt)
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(len(self.archives()), 1)
        self.assertEqual(json.loads(self.archives()[0].read_bytes())["originals"], self.rows)

    def test_existing_temp_paths_are_preserved_before_archive_creation(self):
        def assert_junction(path):
            check = getattr(path, "is_junction", None)
            if check is not None:  # pathlib exposes this from Python 3.12.
                self.assertTrue(check())
            else:
                info = path.lstat()
                self.assertTrue(getattr(info, "st_file_attributes", 0) & 0x400)
                self.assertEqual(getattr(info, "st_reparse_tag", None), 0xA0000003)
        for kind in ("regular", "directory", "alias"):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as folder:
                path = Path(folder) / "state.json"
                path.write_bytes(self.path.read_bytes())
                before = path.read_bytes()
                inspected = recovery.inspect(path)
                tmp = path.with_name(path.name + ".custody-recovery.tmp")
                target = Path(folder) / "alias-target"
                if kind == "regular":
                    tmp.write_bytes(b"prior private replacement evidence")
                elif kind == "directory":
                    tmp.mkdir()
                elif os.name == "nt":
                    target.mkdir()
                    made = subprocess.run(["cmd", "/d", "/c", "mklink", "/J", str(tmp), str(target)],
                                          capture_output=True, timeout=10)
                    self.assertEqual(made.returncode, 0, "synthetic junction creation failed")
                    assert_junction(tmp)
                else:
                    tmp.symlink_to(target)  # deliberately dangling
                with patch.object(recovery, "private_create", side_effect=AssertionError("archive created before temp preflight")) as created:
                    with self.assertRaises(FileExistsError) as held:
                        recovery.quarantine_unknown(path, inspected["stateSha256"],
                            inspected["quarantineUnknown"]["manifestSha256"], 3, "Synthetic prior temporary evidence")
                    created.assert_not_called()
                self.assertEqual(held.exception.custody_phase, "pre-archive")
                self.assertEqual(path.read_bytes(), before)
                self.assertEqual(list(Path(folder).glob("*.custody-quarantine-*.json")), [])
                self.assertTrue(os.path.lexists(tmp))
                if kind == "regular":
                    self.assertEqual(tmp.read_bytes(), b"prior private replacement evidence")
                elif kind == "directory":
                    self.assertTrue(tmp.is_dir())
                elif os.name == "nt":
                    assert_junction(tmp)
                else:
                    self.assertTrue(tmp.is_symlink())

    def test_private_protection_is_read_back_in_order_and_failures_hold(self):
        protection = recovery.private_protection
        for failure, phase in [("archive", "archive-started"), ("temp", "archive-verified"),
                               ("state", "state-replaced-readback-unconfirmed"), (None, None)]:
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as folder:
                path = Path(folder) / "state.json"
                path.write_bytes(self.path.read_bytes())
                before = path.read_bytes()
                pins = recovery.inspect(path)
                calls = []
                def checked(given):
                    kind = "archive" if ".custody-quarantine-" in given.name else "temp" if given.name.endswith(".tmp") else "state"
                    calls.append(kind)
                    if kind == failure:
                        raise ValueError("synthetic private protection readback failure")
                    return protection(given)
                with patch.object(recovery, "private_protection", side_effect=checked):
                    if failure:
                        with self.assertRaises(ValueError) as held:
                            recovery.quarantine_unknown(path, pins["stateSha256"],
                                pins["quarantineUnknown"]["manifestSha256"], 3, "Synthetic private protection review")
                        self.assertEqual(held.exception.custody_phase, phase)
                    else:
                        result = recovery.quarantine_unknown(path, pins["stateSha256"],
                            pins["quarantineUnknown"]["manifestSha256"], 3, "Synthetic private protection review")
                        self.assertEqual(result["protection"], "windows-protected-owner-system" if os.name == "nt" else "posix-owner-only")
                expected = ["archive", "temp", "state"]
                self.assertEqual(calls, expected[:expected.index(failure) + 1] if failure else expected)
                self.assertEqual(len(list(Path(folder).glob("*.custody-quarantine-*.json"))), 1)
                if failure in ("archive", "temp"):
                    self.assertEqual(path.read_bytes(), before)
                else:
                    self.assertEqual(json.loads(path.read_bytes()), {**self.state, "outbox": []})
                self.assertEqual(path.with_name(path.name + ".custody-recovery.tmp").exists(), failure == "temp")

    def test_archive_write_failure_preserves_state_and_partial_archive_blocks_retry(self):
        before, pins = self.path.read_bytes(), self.pins()
        # Initialise the stable lease before injecting archive failure.
        with recovery.StateLease(self.path):
            pass
        with patch.object(recovery.os, "fsync", side_effect=OSError("synthetic archive fsync failure")), self.assertRaises(OSError) as held:
            self.quarantine(pins)
        self.assertEqual(held.exception.custody_phase, "archive-started")
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
        with patch.object(recovery.os, "replace", side_effect=OSError("synthetic replace failure")), self.assertRaises(OSError) as held:
            self.quarantine(pins)
        self.assertEqual(held.exception.custody_phase, "replace-attempted-unconfirmed")
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
        with patch.object(recovery.os, "replace", side_effect=lost_result), self.assertRaises(OSError) as held:
            self.quarantine(pins)
        self.assertEqual(held.exception.custody_phase, "replace-attempted-unconfirmed")
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
        with patch.object(recovery, "_read_state", new=lost_readback), self.assertRaises(OSError) as held:
            self.quarantine(pins)
        self.assertEqual(held.exception.custody_phase, "state-replaced-readback-unconfirmed")
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

    def native_quarantine_fixture(self):
        import test_verification_source_witness280 as native_fixture
        import watcher
        fixture = native_fixture.VerificationSourceWitness280Tests(methodName="runTest")
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        fixture.admit()
        old_body = fixture.body()
        fixture.unknown_verify = True
        fixture.w.handle_chat_line(fixture.line())
        self.assertEqual(len(fixture.verify_paths()), 1)
        self.assertEqual(len(fixture.w.state.d["outbox"]), 1)
        path = fixture.w.state.path
        pins = recovery.inspect(path)
        result = recovery.quarantine_unknown(path, pins["stateSha256"],
            pins["quarantineUnknown"]["manifestSha256"], 1, "Synthetic actual source replay review")
        return fixture, watcher.Watcher(fixture.w.cfg), result, old_body

    def test_two_day_old_savedvariables_file_row_stays_retired_while_a_new_ticket_delivers(self):
        import codes
        import test_verification_source_witness280 as native_fixture
        from datetime import datetime, timezone
        fixture, restarted, result, old_body = self.native_quarantine_fixture()
        archived = Path(result["archive"]).read_bytes()
        old_seen = list(restarted.state.d["seen"])
        old_key = restarted.code_key("w", native_fixture.NAME, fixture.code)
        old_event = {"type": "whisper", "name": native_fixture.NAME, "guid": native_fixture.GUID,
                     "code": fixture.code, "ok": True, "ts": old_body["ts"],
                     "nativeMembership": copy.deepcopy(old_body["nativeMembership"])}
        old_event_bytes = json.dumps(old_event, sort_keys=True).encode()
        fixture.at += 2 * 86400
        class SourceClock(datetime):
            @classmethod
            def now(cls, tz=None):
                return datetime.fromtimestamp(fixture.at, tz)
        calls = []
        def transport(method, route, body=None, retries=3):
            calls.append((method, route, copy.deepcopy(body)))
            if route == "/ingest/roster":
                return True, {"snapshot": 9, "trusted": True, "members": len(body["members"])}
            self.assertEqual((method, route), ("POST", "/ingest/verify"))
            self.assertEqual(body, fixture.body())
            return True, {"result": "member", "pendingConsumed": True}
        restarted.worker.call = transport
        def write_next_file():
            fixture.write()
            stamp = max(fixture.w.sv_file.stat().st_mtime, restarted.state.d["sv_mtime"]) + 1
            os.utime(fixture.w.sv_file, (stamp, stamp))
            return fixture.w.sv_file.stat().st_mtime
        with patch.object(codes, "datetime", SourceClock):
            self.assertIsNone(codes.code_kind(native_fixture.SECRET, native_fixture.NAME, fixture.code))
            fixture.db["events"] = [copy.deepcopy(old_event)]
            fixture.db["roster"]["exportedAt"] = fixture.at
            mtime = write_next_file()
            restarted.check_savedvars()
            self.assertEqual([(m, r) for m, r, _ in calls], [("POST", "/ingest/roster")])
            self.assertEqual(restarted._verification_roster["exportedAt"], fixture.at)
            self.assertTrue(restarted.verification_roster_ready(fixture.body()))
            self.assertEqual(restarted.state.d["sv_mtime"], mtime)
            self.assertEqual(restarted.state.d["outbox"], [])
            self.assertEqual(restarted.state.d["seen"], old_seen)
            self.assertEqual(Path(result["archive"]).read_bytes(), archived)
            # Keep the old row in the actual Lua file while adding a genuinely
            # new request. This positive path catches collectors dropping every
            # SavedVariables event instead of honoring only the retained claim.
            fixture.at += 1
            fixture.code = codes.ticket_for(native_fixture.SECRET, "XYZ",
                codes.day_bucket(datetime.fromtimestamp(fixture.at, timezone.utc)))
            self.assertEqual(codes.code_kind(native_fixture.SECRET, native_fixture.NAME, fixture.code), "ticket")
            new_body = fixture.body()
            fixture.db["events"] = [copy.deepcopy(old_event), {"type": "whisper", "name": native_fixture.NAME,
                "guid": native_fixture.GUID, "code": fixture.code, "ok": True, "ts": fixture.at,
                "nativeMembership": copy.deepcopy(new_body["nativeMembership"])}]
            fixture.db["roster"]["exportedAt"] = fixture.at
            mtime = write_next_file()
            restarted.check_savedvars()
            verified = [body for method, route, body in calls if route == "/ingest/verify"]
            self.assertEqual(verified, [new_body])
            self.assertEqual(restarted.state.d["sv_mtime"], mtime)
            self.assertEqual(restarted.state.d["outbox"], [])
            self.assertTrue(restarted.state.was_seen(old_key))
            self.assertTrue(all(claim in restarted.state.d["seen"] for claim in old_seen))
            self.assertTrue(restarted.state.was_seen(restarted.code_key("w", native_fixture.NAME, fixture.code)))
            self.assertEqual(json.dumps(fixture.db["events"][0], sort_keys=True).encode(), old_event_bytes)
            self.assertEqual(Path(result["archive"]).read_bytes(), archived)

    def test_savedvariables_note_claim_stays_retired_without_events_resend_and_new_note_works(self):
        import test_verification_source_witness280 as native_fixture
        import watcher
        fixture = native_fixture.VerificationSourceWitness280Tests(methodName="runTest")
        self.addCleanup(fixture.doCleanups)
        fixture.setUp()
        fixture.admit()
        old_event = {"type": "note", "name": native_fixture.NAME, "ts": fixture.at,
                     "detail": "Synthetic original note", "ok": True}
        captures = []
        def first_transport(method, route, body=None, retries=3):
            if route == "/ingest/roster":
                return True, {"snapshot": 10, "trusted": True, "members": len(body["members"])}
            self.assertEqual((method, route), ("POST", "/ingest/events"))
            captures.append(copy.deepcopy(body))
            return False, "synthetic unresolved event outcome"
        fixture.w.worker.call = first_transport
        def write_next_file(consumer):
            fixture.write()
            stamp = max(fixture.w.sv_file.stat().st_mtime, consumer.state.d["sv_mtime"]) + 1
            os.utime(fixture.w.sv_file, (stamp, stamp))
            return fixture.w.sv_file.stat().st_mtime
        fixture.db["events"] = [copy.deepcopy(old_event)]
        write_next_file(fixture.w)
        fixture.w.check_savedvars()
        self.assertEqual(len(captures), 1)
        path = fixture.w.state.path
        before = json.loads(path.read_bytes())
        self.assertEqual(len(before["outbox"]), 1)
        self.assertEqual(before["outbox"][0]["path"], "/ingest/events")
        old_key = "e:note:" + watcher.codes.normalize_character(native_fixture.NAME) + ":" + str(old_event["ts"])
        self.assertTrue(fixture.w.state.was_seen(old_key))
        pins = recovery.inspect(path)
        result = recovery.quarantine_unknown(path, pins["stateSha256"],
            pins["quarantineUnknown"]["manifestSha256"], 1, "Synthetic file-event claim review")
        self.assertEqual(json.loads(path.read_bytes()), {**before, "outbox": []})
        archived = Path(result["archive"]).read_bytes()
        restarted = watcher.Watcher(fixture.w.cfg)
        calls = []
        def transport(method, route, body=None, retries=3):
            calls.append((method, route, copy.deepcopy(body)))
            if route == "/ingest/roster":
                return True, {"snapshot": 11, "trusted": True, "members": len(body["members"])}
            self.assertEqual((method, route), ("POST", "/ingest/events"))
            self.assertEqual(len(body["events"]), 1)
            self.assertEqual(body["events"][0]["ts"], new_event["ts"])
            self.assertEqual(body["events"][0]["detail"], new_event["detail"])
            return True, {"recorded": 1}
        restarted.worker.call = transport
        old_seen = list(restarted.state.d["seen"])
        fixture.at += 1
        fixture.db["roster"]["exportedAt"] = fixture.at
        write_next_file(restarted)
        restarted.check_savedvars()
        self.assertEqual([(m, r) for m, r, _ in calls], [("POST", "/ingest/roster")])
        self.assertFalse(any(route == "/ingest/events" for _, route, _ in calls))
        self.assertEqual(restarted.state.d["seen"], old_seen)
        self.assertEqual(restarted.state.d["outbox"], [])
        self.assertEqual(Path(result["archive"]).read_bytes(), archived)
        fixture.at += 1
        new_event = {**old_event, "ts": fixture.at, "detail": "Synthetic genuinely new note"}
        fixture.db["events"] = [copy.deepcopy(old_event), copy.deepcopy(new_event)]
        fixture.db["roster"]["exportedAt"] = fixture.at
        write_next_file(restarted)
        restarted.check_savedvars()
        events_calls = [body for _, route, body in calls if route == "/ingest/events"]
        self.assertEqual(len(events_calls), 1)
        self.assertTrue(restarted.state.was_seen(old_key))
        self.assertTrue(all(claim in restarted.state.d["seen"] for claim in old_seen))
        self.assertEqual(restarted.state.d["outbox"], [])
        self.assertEqual(fixture.db["events"][0], old_event)
        self.assertEqual(Path(result["archive"]).read_bytes(), archived)

    def test_plain_whisper_kept_claim_blocks_capture_with_fresh_native_source_and_new_ticket_works(self):
        import codes
        import test_verification_source_witness280 as native_fixture
        from datetime import datetime, timezone
        fixture, restarted, result, old_body = self.native_quarantine_fixture()
        class SourceClock(datetime):
            @classmethod
            def now(cls, tz=None):
                return datetime.fromtimestamp(fixture.at, tz)
        clock = patch.object(codes, "datetime", SourceClock)
        clock.start()
        self.addCleanup(clock.stop)
        archived = Path(result["archive"]).read_bytes()
        old_seen = list(restarted.state.d["seen"])
        old_key = restarted.code_key("w", native_fixture.NAME, fixture.code)
        calls = []
        def transport(method, route, body=None, retries=3):
            calls.append((method, route, copy.deepcopy(body)))
            if route == "/ingest/roster":
                return True, {"snapshot": 10, "trusted": True, "members": len(body["members"])}
            self.assertEqual((method, route), ("POST", "/ingest/verify"))
            self.assertEqual(body, fixture.body())
            return True, {"result": "member", "pendingConsumed": True}
        restarted.worker.call = transport
        fixture.at += 1
        fixture.db["roster"]["exportedAt"] = fixture.at
        fixture.write()
        stamp = max(fixture.w.sv_file.stat().st_mtime, restarted.state.d["sv_mtime"]) + 1
        os.utime(fixture.w.sv_file, (stamp, stamp))
        restarted.check_savedvars()
        self.assertTrue(restarted.verification_roster_ready(fixture.body()))
        self.assertIsNotNone(codes.code_kind(native_fixture.SECRET, native_fixture.NAME, fixture.code))
        self.assertIsNotNone(restarted.read_native_membership(fixture.line()))
        self.assertIn(old_key, restarted._native_membership)
        self.assertTrue(restarted.state.was_seen(old_key))
        # This sentinel distinguishes the early kept-claim guard from a later
        # claim-ownership or transport refusal that could also suppress a POST.
        with patch.object(restarted, "_post_claimed", side_effect=AssertionError("kept plain-whisper claim recaptured")) as captured:
            restarted.handle_chat_line(f"11/6 01:00:00.000  {native_fixture.NAME} whispers: !verify {fixture.code}")
            captured.assert_not_called()
        self.assertEqual([(m, r) for m, r, _ in calls], [("POST", "/ingest/roster")])
        self.assertEqual(restarted.state.d["seen"], old_seen)
        self.assertEqual(restarted.state.d["outbox"], [])
        fixture.at += 1
        fixture.code = codes.ticket_for(native_fixture.SECRET, "XYZ",
            codes.day_bucket(datetime.fromtimestamp(fixture.at, timezone.utc)))
        self.assertEqual(codes.code_kind(native_fixture.SECRET, native_fixture.NAME, fixture.code), "ticket")
        self.assertIsNotNone(restarted.read_native_membership(fixture.line()))
        self.assertTrue(restarted.verification_roster_ready(fixture.body()))
        restarted.handle_chat_line(f"11/6 01:00:00.000  {native_fixture.NAME} whispers: !verify {fixture.code}")
        self.assertEqual([body for _, route, body in calls if route == "/ingest/verify"], [fixture.body()])
        self.assertEqual(restarted.state.d["outbox"], [])
        self.assertTrue(restarted.state.was_seen(old_key))
        self.assertTrue(all(claim in restarted.state.d["seen"] for claim in old_seen))
        self.assertEqual(Path(result["archive"]).read_bytes(), archived)

    def test_old_source_stays_deduplicated_and_a_new_signed_ticket_delivers_after_quarantine(self):
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
        # A new real request has a different valid ticket and native signature.
        # It must remain usable without clearing the old source's seen claim or
        # changing its archived body/clock. External HTTP alone is substituted.
        import codes
        from datetime import datetime, timezone
        old_seen = list(restarted.state.d["seen"])
        old_key = restarted.code_key("w", native_fixture.NAME, fixture.code)
        fixture.at += 1
        fixture.code = codes.ticket_for(native_fixture.SECRET, "ABC",
                                       codes.day_bucket(datetime.fromtimestamp(fixture.at, timezone.utc)))
        self.assertNotEqual(fixture.code, old_body["code"])
        self.assertTrue(restarted.verification_roster_ready(fixture.body()))
        new_requests = []
        def new_transport(method, route, body=None, retries=3):
            self.assertEqual((method, route), ("POST", "/ingest/verify"))
            self.assertEqual(body, fixture.body())
            new_requests.append(copy.deepcopy(body))
            return True, {"result": "member", "pendingConsumed": True}
        restarted.worker.call = new_transport
        restarted.handle_chat_line(fixture.line())
        restarted.forward_events([{"type": "whisper", "name": native_fixture.NAME, "guid": native_fixture.GUID,
                                   "code": fixture.code, "ok": True, "ts": fixture.at,
                                   "nativeMembership": fixture.body()["nativeMembership"]}])
        self.assertEqual(new_requests, [fixture.body()])
        self.assertTrue(restarted.state.was_seen(old_key))
        self.assertTrue(all(claim in restarted.state.d["seen"] for claim in old_seen))
        self.assertTrue(restarted.state.was_seen(restarted.code_key("w", native_fixture.NAME, fixture.code)))
        self.assertEqual(restarted.state.d["outbox"], [])
        self.assertEqual(Path(result["archive"]).read_bytes(), archive)

    def test_cli_failure_phases_are_fixed_payload_free_and_preserve_evidence(self):
        import contextlib
        import io
        for failure, phase in [("archive", "archive-started"), ("replace", "replace-attempted-unconfirmed"),
                               ("state", "state-replaced-readback-unconfirmed")]:
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as folder:
                path = Path(folder) / "state.json"
                path.write_bytes(self.path.read_bytes())
                pins = recovery.inspect(path)
                argv = ["custody_recovery", "--state", str(path), "quarantine-unknown", "--state-sha256", pins["stateSha256"],
                        "--manifest-sha256", pins["quarantineUnknown"]["manifestSha256"], "--count", "3", "--reason", "Synthetic CLI phase review"]
                protected = recovery.private_protection
                def readback(given):
                    if failure == "archive" and ".custody-quarantine-" in given.name or failure == "state" and given == path:
                        raise ValueError("SYNTHETIC PRIVATE SECRET PATH PAYLOAD")
                    return protected(given)
                output, errors = io.StringIO(), io.StringIO()
                with patch.object(sys, "argv", argv), patch.object(recovery, "private_protection", side_effect=readback), \
                        patch.object(recovery.os, "replace", side_effect=OSError("SYNTHETIC PRIVATE SECRET PATH PAYLOAD")) if failure == "replace" else contextlib.nullcontext(), \
                        contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
                    result = recovery.main()
                self.assertEqual(result, 2)
                self.assertEqual(output.getvalue(), "")
                self.assertIn("phase=" + phase + ";", errors.getvalue())
                self.assertIn("preserve state, archive and temporary files", errors.getvalue())
                self.assertNotIn("SYNTHETIC PRIVATE", errors.getvalue())
                self.assertNotIn(str(path), errors.getvalue())
                self.assertNotIn("nothing changed", errors.getvalue())
                self.assertEqual(len(list(Path(folder).glob("*.custody-quarantine-*.json"))), 1)
                self.assertEqual(json.loads(path.read_bytes())["outbox"], [] if failure == "state" else self.rows)

    def test_cli_runs_without_network_or_watcher_imports_and_rejects_queue_lane(self):
        script = Path(recovery.__file__).resolve()
        # Python 3.10-3.12 pathlib itself imports urllib.parse. Warm this
        # standard-library dependency before closing helper/network imports.
        code = """import builtins,runpy,sys,pathlib
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

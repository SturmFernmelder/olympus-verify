"""Real watcher, temporary owned source files and one-attempt fake transport only."""
from __future__ import annotations
import copy
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, os.environ.get("WATCHER_TEST_SOURCE", str(Path(__file__).resolve().parents[1])))
import watcher
import intake242
import savedvars
import savedvars_source280 as source


def lua(value):
    if isinstance(value, dict):
        return "{" + ",".join("[" + lua(k) + "]=" + lua(v) for k, v in value.items()) + "}"
    if isinstance(value, list):
        return "{" + ",".join(lua(v) for v in value) + "}"
    if value is None:
        return "nil"
    if type(value) is bool:
        return "true" if value else "false"
    return json.dumps(value, ensure_ascii=False)


class WatcherSource280Tests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(); self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.cfg = dict(wow_dir=str(self.root), account="SYNTHETIC", worker_url="https://test.invalid",
                        watcher_token="synthetic-token", verify_secret="synthetic-only", officer_character="Fern Melder",
                        membership_only=True, state_file=str(self.root / "state.json"))
        self.w = watcher.Watcher(self.cfg); self.w.sv_file.parent.mkdir(parents=True)
        self.calls = []; self.w.worker.paused = lambda: None; self.w.worker.call = self.transport

    def transport(self, method, path, body=None, retries=3):
        self.calls.append((method, path, copy.deepcopy(body), retries))
        return True, {"version": 242, "acknowledgements": [{"id": r["id"], "character": r["character"],
            "guid": r.get("guid", ""), "status": "done", "outcome": "synthetic"} for r in body.get("entries", [])]}

    def row(self, eid="current", kind="role"):
        return dict(id=eid, type=kind, source="native-discord-event242", character="Synthetic Sender",
                    guid="Player-1-9999ABCD", requestedAt=int(time.time()))

    def original(self, body):
        canonical, digest = intake242._canonical_body(body)
        return dict(body=canonical, sha256=digest, state="pending", attempted=False)

    def write(self, entries=None, **db):
        if entries is not None:
            db["intake242"] = {"entries": entries}
        self.w.sv_file.write_text("OlympusVerifyDB=" + lua(db), encoding="utf-8")

    def test_foreign_addon_and_pending_role_mirrors_never_create_new_originals(self):
        for filename, dbname in (("Olympus.lua", "OlympusDB"), ("OlympusRecord.lua", "OlympusRecordDB")):
            self.w.sv_file.with_name(filename).write_text(dbname + "=" + lua({"intake242": {"entries": {filename: self.row(filename)}}}), encoding="utf-8")
        self.write({}, pendingRoleUpdates={"mirror": self.row("mirror")})
        retained = self.original(self.row("retained")); self.w.state.d["intake242"] = {"retained": retained}
        before = copy.deepcopy(retained); intake242.collect(self.w)
        self.assertEqual(self.w.state.d["intake242"], {"retained": before})

    def test_unchanged_owned_bytes_parse_once_and_do_not_rewrite_custody(self):
        self.write({"current": self.row()})
        with patch.object(savedvars, "parse", wraps=savedvars.parse) as parse, patch.object(self.w.state, "save", wraps=self.w.state.save) as save:
            intake242.collect(self.w); intake242.collect(self.w)
        self.assertEqual(parse.call_count, 1); self.assertEqual(save.call_count, 1)

    def test_oversized_source_is_refused_before_parser(self):
        self.w.sv_file.write_bytes(b" " * (16 * 1024 * 1024 + 1))
        with patch.object(savedvars, "parse", wraps=savedvars.parse) as parse:
            intake242.collect(self.w)
        self.assertEqual(parse.call_count, 0); self.assertFalse(self.w.state.d.get("intake242"))

    def test_hardlinked_owned_file_is_not_parsed(self):
        self.write({"current": self.row()}); os.link(self.w.sv_file, self.root / "second-link.lua")
        with patch.object(savedvars, "parse", wraps=savedvars.parse) as parse:
            intake242.collect(self.w)
        self.assertEqual(parse.call_count, 0); self.assertFalse(self.w.state.d.get("intake242"))

    def test_actual_symlink_is_refused_before_parser(self):
        target = self.root / "outside.lua"; target.write_text("OlympusVerifyDB={}", encoding="utf-8")
        try:
            self.w.sv_file.symlink_to(target)
        except OSError:
            self.skipTest("OS does not permit this process to create a synthetic symlink")
        with patch.object(savedvars, "parse", wraps=savedvars.parse) as parse:
            intake242.collect(self.w)
        self.assertEqual(parse.call_count, 0)

    def test_actual_symlink_parent_is_refused_before_parser(self):
        self.write({"current": self.row()}); parent = self.w.sv_file.parent
        real = parent.with_name("ActualOwned"); parent.rename(real)
        try:
            parent.symlink_to(real, target_is_directory=True)
        except OSError:
            real.rename(parent)
            self.skipTest("OS does not permit this process to create a synthetic directory symlink")
        with patch.object(savedvars, "parse", wraps=savedvars.parse) as parse:
            intake242.collect(self.w)
        self.assertEqual(parse.call_count, 0); self.assertEqual(self.calls, [])

    def test_growth_during_descriptor_read_is_refused_before_parser(self):
        self.write({"current": self.row()}); native = source.os.fdopen
        class GrowingRead:
            def __init__(inner, fd, mode): inner.stream = native(fd, mode)
            def __enter__(inner): return inner
            def __exit__(inner, *args): inner.stream.close()
            def fileno(inner): return inner.stream.fileno()
            def read(inner, maximum):
                self.assertLessEqual(maximum, source.MAX_BYTES + 1)
                with self.w.sv_file.open("ab") as changed: changed.write(b" ")
                return inner.stream.read(maximum)
        with patch.object(source.os, "fdopen", GrowingRead), patch.object(savedvars, "parse", wraps=savedvars.parse) as parse:
            intake242.collect(self.w)
        self.assertEqual(parse.call_count, 0); self.assertEqual(self.calls, [])

    def test_parser_cache_is_not_mutable_consumer_authority(self):
        self.write({"current": self.row()}); first = source.owned(self.w)
        first.data["OlympusVerifyDB"]["intake242"]["entries"]["current"]["character"] = "UNTRUSTED MUTATION"
        second = source.owned(self.w)
        self.assertEqual(second.data["OlympusVerifyDB"]["intake242"]["entries"]["current"]["character"], "Synthetic Sender")

    def test_same_size_in_place_restored_mtime_still_checks_byte_digest(self):
        self.write({"first": self.row("first")}); intake242.collect(self.w); before = self.w.sv_file.stat()
        raw = self.w.sv_file.read_bytes().replace(b"first", b"other"); self.w.sv_file.write_bytes(raw)
        os.utime(self.w.sv_file, ns=(before.st_atime_ns, before.st_mtime_ns))
        intake242.collect(self.w); self.assertIn("other", self.w.state.d["intake242"])

    def test_same_stamp_replacement_reparses_actual_new_bytes(self):
        self.write({"first": self.row("first")}); intake242.collect(self.w)
        old = self.w.sv_file.stat(); replacement = self.w.sv_file.with_suffix(".replacement")
        replacement.write_text("OlympusVerifyDB=" + lua({"intake242": {"entries": {"other": self.row("other")}}}), encoding="utf-8")
        os.utime(replacement, ns=(old.st_atime_ns, old.st_mtime_ns)); replacement.replace(self.w.sv_file)
        intake242.collect(self.w)
        self.assertIn("other", self.w.state.d["intake242"])

    def test_malformed_event_timestamp_does_not_block_later_valid_event(self):
        self.w.forward_events([dict(type="joined", name="Invalid", ts="not-a-number"),
                               dict(type="joined", name="Later Sender", ts=int(time.time()))])
        self.assertEqual(len(self.calls), 1); self.assertEqual(self.calls[0][2]["events"][0]["name"], "Later Sender")

    def test_invalid_roster_cannot_starve_already_collected_owned_intake(self):
        self.write({"current": self.row()}, roster=["malformed-roster"])
        self.w.note_saved_relay = lambda *a: None
        with patch.object(watcher.time, "sleep", return_value=None):
            try: self.w.check_savedvars()
            except watcher.SavedVariablesSourceUnavailable: pass
        self.assertEqual(len(self.calls), 1); self.assertEqual(self.calls[0][1], intake242.PATH)

    def test_nonserializable_cursor_save_is_global_custody_halt(self):
        self.write({}); self.w.state.d["synthetic-invalid"] = object(); self.w.note_saved_relay = lambda *a: None
        self.w.forward_roster = lambda *a, **k: None; self.w.read_launch_control = lambda *a: None
        with patch.object(watcher.time, "sleep", return_value=None):
            with self.assertRaises(TypeError): self.w.check_savedvars()
        self.assertTrue(self.w._custody_halted); self.assertEqual(self.calls, [])

    def test_transport_pause_journal_failure_is_also_global_custody_halt(self):
        with patch.object(self.w.state, "save", side_effect=ValueError("synthetic journal")):
            with self.assertRaises(ValueError): self.w.worker._save_pause()
        self.assertTrue(self.w._custody_halted); self.assertEqual(self.calls, [])

    def test_deferred_first_page_has_backoff_and_later_new_row_progresses(self):
        rows = {f"branch-{i}": self.original(self.row(f"branch-{i}")) for i in range(25)}
        rows["later"] = self.original(self.row("later")); self.w.state.d["intake242"] = rows
        def deferred(method, path, body=None, retries=3):
            self.calls.append(copy.deepcopy(body))
            return True, {"version": 242, "acknowledgements": [], "deferred": [
                {"id": r["id"], "character": r["character"], "guid": r["guid"], "outcome": "approved_branch_authority_pending", "originalNoEffect": True}
                for r in body["entries"]]}
        self.w.worker.call = deferred
        intake242.drain(self.w, False); intake242.drain(self.w, False); intake242.drain(self.w, False)
        self.assertEqual(len(self.calls), 2); self.assertEqual(self.calls[1]["entries"], [rows["later"]["body"]])
        self.assertTrue(rows["branch-0"]["attempted"])

    def test_unknown_role_attempt_never_reposts_next_loop_or_restart(self):
        self.w.state.d["intake242"] = {"current": self.original(self.row())}
        self.w.worker.call = lambda *a, **k: (self.calls.append(a) or (False, {}))
        intake242.drain(self.w, False); intake242.drain(self.w, False)
        other = watcher.Watcher(self.cfg); other.worker.paused = lambda: None; other.worker.call = self.w.worker.call
        intake242.drain(other, False); self.assertEqual(len(self.calls), 1)

    def test_exact_no_effect_retry_is_spent_before_dispatch_and_not_adopted_on_restart(self):
        row = self.original(self.row()); self.w.state.d["intake242"] = {"current": row}; at = int(time.time())
        receipt = dict(id="current", character=row["body"]["character"], guid=row["body"]["guid"], outcome="approved_branch_authority_pending", originalNoEffect=True)
        def deferred(*args, **kwargs):
            self.calls.append(args)
            if len(self.calls) == 1: return True, dict(version=242, acknowledgements=[], deferred=[receipt])
            self.assertTrue(json.loads(self.w.state.path.read_text(encoding="utf-8"))["intake242"]["current"]["retrySchedule280"]["spent"])
            return False, {}
        self.w.worker.call = deferred
        with patch.object(intake242.time, "time", return_value=at): intake242.drain(self.w, False)
        persisted = self.w.state.path.read_bytes()
        with patch.object(intake242.time, "time", return_value=at + 299): intake242.drain(self.w, False)
        self.assertEqual(len(self.calls), 1)
        with patch.object(intake242.time, "time", return_value=at + 301): intake242.drain(self.w, False)
        with patch.object(intake242.time, "time", return_value=at + 602): intake242.drain(self.w, False)
        self.assertEqual(len(self.calls), 2); self.assertTrue(row["attempted"])
        self.w.state.path.write_bytes(persisted)
        other = watcher.Watcher(self.cfg); other.worker.paused = lambda: None; other.worker.call = deferred
        with patch.object(intake242.time, "time", return_value=at + 999): intake242.drain(other, False)
        self.assertEqual(len(self.calls), 2)

    def test_bad_no_effect_identity_or_unknown429_never_authorizes_retry(self):
        for delta in ({"guid": "Player-1-DEADBEEF"}, {"character": "Other"}, {"originalNoEffect": False}, {"outcome": "429"}):
            row = self.original(self.row()); self.w.state.d["intake242"] = {"current": row}; calls = []
            receipt = dict(id="current", character=row["body"]["character"], guid=row["body"]["guid"], outcome="membership_source_pending", originalNoEffect=True)
            receipt.update(delta)
            self.w.worker.call = lambda *a, **k: (calls.append(a) or (True, dict(version=242, acknowledgements=[], deferred=[receipt])))
            intake242.drain(self.w, False)
            with patch.object(intake242.time, "time", return_value=time.time() + 1000): intake242.drain(self.w, False)
            self.assertEqual(len(calls), 1); self.assertEqual(row["state"], "outcome_unknown")

    def test_retained_oversize_identity_holds_without_rewriting_original(self):
        body = self.row(); body["character"] = "A" * 110; row = self.original(body)
        self.w.state.d["intake242"] = {"current": row}; intake242.drain(self.w, False)
        self.assertEqual(row["policyHold"], "transport_identity_held"); self.assertEqual(row["body"], body)
        self.assertEqual(self.calls, [])

    def test_transport_cannot_mutate_frozen_original_and_bad_receipts_do_not_abort_later_lane(self):
        body = self.row(); original = self.original(body); self.w.state.d["intake242"] = {"current": original}
        def transport(method, path, payload, retries=3):
            payload["entries"][0]["character"] = "Transport mutation"
            return True, dict(version=242, deferred=[{"id": []}], policyHolds=[{"id": []}], acknowledgements=[{"id": [], "status": "done"}])
        self.w.worker.call = transport; intake242.drain(self.w, False)
        self.assertEqual(original["body"], body); self.assertEqual(original["state"], "pending")

    def test_retained_body_hash_mismatch_is_held_without_repair_or_dispatch(self):
        original = self.original(self.row()); original["sha256"] = "0" * 64
        self.w.state.d["intake242"] = {"current": original}; before = copy.deepcopy(original["body"])
        intake242.drain(self.w, False)
        self.assertEqual(original["body"], before); self.assertEqual(original["sha256"], "0" * 64)
        self.assertEqual(original["policyHold"], "intake_original_integrity_held"); self.assertEqual(self.calls, [])

    def test_forged_ack_guid_never_settles_same_id(self):
        row = self.original(self.row()); self.w.state.d["intake242"] = {"current": row}
        self.w.worker.call = lambda *a, **k: (True, {"version": 242, "acknowledgements": [
            {"id": "current", "character": row["body"]["character"], "guid": "Player-1-DEADBEEF", "status": "done"}]})
        intake242.drain(self.w, False); self.assertEqual(row["state"], "pending")

    def test_unknown_head_allows_one_fresh_claimed_event_and_never_resends_it(self):
        self.w.state.d["outbox"] = [{"path": "/ingest/verify", "body": {"old": True}}]
        self.w.worker.call = lambda *a, **k: (self.calls.append(copy.deepcopy(a)) or (False, {}))
        self.w.forward_events([dict(type="joined", name="Current Event", ts=int(time.time()))])
        self.assertEqual(len(self.calls), 1); self.w.flush_outbox(); self.w.flush_outbox()
        self.assertEqual(len(self.calls), 1)
        other = watcher.Watcher(self.cfg); other.worker.paused = lambda: None; other.worker.call = self.w.worker.call
        other.flush_outbox(); self.assertEqual(len(self.calls), 1)
        self.assertEqual(len(other.state.d["outbox"]), 2)

    def test_new_event_ack_settles_nonhead_and_preserves_unknown_head(self):
        original = {"path": "/ingest/verify", "body": {"old": True}}; self.w.state.d["outbox"] = [original]
        self.w.forward_events([dict(type="joined", name="Current Event", ts=int(time.time()))])
        self.assertEqual(len(self.calls), 1); self.assertEqual(self.calls[0][3], 1)
        self.assertEqual(self.w.state.d["outbox"], [original])

    def test_generic_loaded_event_path_cannot_acquire_fresh_scheduling_authority(self):
        self.w.post("/ingest/events", {"events": [{"type": "joined", "name": "Unowned", "ts": int(time.time())}]}, "path alone")
        self.w.flush_outbox(); self.assertEqual(self.calls, [])

    def test_event_known_ack_failed_local_settlement_recovers_without_http(self):
        original = {"path": "/ingest/verify", "body": {"old": True}}; self.w.state.d["outbox"] = [original]
        native_save = self.w.state.save; saves = []
        def save():
            saves.append(True)
            if len(saves) == 2: raise OSError("synthetic uncertain settlement")
            native_save()
        with patch.object(self.w.state, "save", save):
            self.w.forward_events([dict(type="joined", name="Current Event", ts=int(time.time()))])
        self.assertTrue(self.w._custody_halted); self.assertEqual(len(self.calls), 1)
        self.assertTrue(self.w.recover_local_settlement()); self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.w.state.d["outbox"], [original])


if __name__ == "__main__":
    unittest.main()

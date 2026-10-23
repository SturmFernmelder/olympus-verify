"""Actual keeper watcher; temporary synthetic files and stubbed transport only. No user config/provider."""
from __future__ import annotations
import contextlib
import copy
import io
import json
import sys
import tempfile
import time
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import watcher
import codes


class Custody196Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "Logs").mkdir()
        (self.root / "WTF/Account/SYNTHETIC/SavedVariables").mkdir(parents=True)
        self.cfg = {"worker_url": "https://example.invalid", "watcher_token": "synthetic-token", "verify_secret": "olympus-test-secret",
                    "wow_dir": str(self.root), "account": "SYNTHETIC", "officer_character": "Synthetic Officer", "state_file": str(self.root / "state.json"), "max_outbox": 2}
        self.w = watcher.Watcher(self.cfg)
        self.calls = []
        self.logs = io.StringIO()
        self.output = contextlib.redirect_stdout(self.logs)
        self.output.__enter__()
        self.w.worker.call = self.fail

    def tearDown(self):
        self.output.__exit__(None, None, None)
        self.tmp.cleanup()

    def disk(self):
        return json.loads(self.w.state.path.read_text(encoding="utf-8"))

    def fail(self, method, path, body=None, retries=3):
        self.calls.append((method, path, copy.deepcopy(body), retries))
        return False, "synthetic-unknown"

    def succeed(self, method, path, body=None, retries=3):
        self.calls.append((method, path, copy.deepcopy(body), retries))
        return True, {"ok": True}

    def held(self, name="Original"):
        body = {"events": [{"name": name, "ts": 100, "type": "joined"}]}
        self.assertIs(self.w.post("/ingest/events", body, "synthetic event"), watcher.Delivery.HELD)
        return body

    def code_event(self, name):
        code = codes.valid_codes(self.cfg["verify_secret"], name)[0]
        return {"type": "whisper", "name": name, "code": code, "ok": True, "ts": int(time.time())}

    def test_frozen_original_is_on_disk_before_http_and_survives_input_and_transport_mutation(self):
        body = {"events": [{"name": "Original", "ts": 77}]}
        observed = []
        def transport(method, path, sent, retries=3):
            disk = self.disk()["outbox"][0]
            observed.append(copy.deepcopy(disk))
            self.assertEqual(disk["body"], body)
            sent["events"][0]["name"] = "transport mutation"
            return False, "unknown"
        self.w.worker.call = transport
        with patch.object(watcher.time, "time", return_value=123):
            self.assertIs(self.w.post("/ingest/events", body, "event"), watcher.Delivery.HELD)
        body["events"][0]["ts"] = 999
        self.assertEqual(self.w.state.d["outbox"][0], observed[0])
        self.w.worker.call = self.succeed
        with patch.object(watcher.time, "time", return_value=900):
            self.w.flush_outbox()
        self.assertEqual(self.calls[-1][2]["events"][0], {"name": "Original", "ts": 77})
        self.assertEqual(self.disk()["outbox"], [])

    def test_full_queue_does_not_dispatch_or_evict_or_raise_cap(self):
        self.w.max_outbox = 1
        self.held()
        before = copy.deepcopy(self.w.state.d["outbox"])
        self.assertIs(self.w.post("/ingest/verify", {"ts": 200}, "new"), watcher.Delivery.NO_CUSTODY)
        self.assertEqual(self.w.state.d["outbox"], before)
        self.assertEqual(self.disk()["outbox"], before)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.w.max_outbox, 1)

    def test_newer_original_is_buffered_without_overtaking_and_fifo_stops_on_unknown(self):
        self.held("First")
        self.held("Second")
        self.assertEqual(len(self.calls), 1)
        self.w.flush_outbox()
        self.assertEqual([c[2]["events"][0]["name"] for c in self.calls], ["First", "First"])
        self.assertEqual(len(self.disk()["outbox"]), 2)

    def test_failure_to_reserve_stops_http_and_new_custody(self):
        with patch.object(self.w.state, "save", side_effect=OSError("synthetic write failure")):
            self.assertIs(self.w.post("/ingest/events", {}, "event"), watcher.Delivery.NO_CUSTODY)
        self.w.flush_outbox()
        self.assertIs(self.w.post("/ingest/events", {}, "new"), watcher.Delivery.NO_CUSTODY)
        self.assertEqual(self.calls, [])
        self.assertTrue(self.w._custody_halted)

    def test_uncertain_local_replace_commits_claim_with_body_or_keeps_source_unconsumed(self):
        save = self.w.state.save
        def replace_then_raise():
            save()
            raise OSError("synthetic uncertain local replace")
        with patch.object(self.w.state, "save", side_effect=replace_then_raise):
            with self.assertRaises(watcher.NoCustody):
                self.w._post_claimed("/ingest/events", {"events": [{"ts": 51}]}, "event", ["original-key"])
        self.assertEqual(self.calls, [])
        self.assertFalse(self.w.state.was_seen("original-key"))
        restarted = watcher.Watcher(self.cfg)
        self.assertTrue(restarted.state.was_seen("original-key"))
        self.assertEqual(restarted.state.d["outbox"][0]["body"]["events"][0]["ts"], 51)

    def test_capacity_rollback_restores_all_8000_dedupe_entries(self):
        self.w.max_outbox = 0
        self.w.state.d["seen"] = [str(i) for i in range(8000)]
        before = list(self.w.state.d["seen"])
        with self.assertRaises(watcher.NoCustody):
            self.w._post_claimed("/ingest/events", {}, "event", ["new-key"])
        self.assertEqual(self.w.state.d["seen"], before)

    def test_transport_exception_retains_original_and_does_not_log_payload_or_exception_text(self):
        self.w.worker.call = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("NEVER_LOG_TRANSPORT"))
        self.assertIs(self.w.post("/ingest/verify", {"code": "NEVER_LOG_CODE"}, "event"), watcher.Delivery.HELD)
        self.assertEqual(len(self.disk()["outbox"]), 1)
        self.assertNotIn("NEVER_LOG", self.logs.getvalue())

    def test_acknowledged_original_is_not_lost_when_settlement_write_fails(self):
        save = self.w.state.save
        writes = 0
        def fail_second():
            nonlocal writes
            writes += 1
            if writes == 2:
                raise OSError("synthetic settlement failure")
            save()
        self.w.worker.call = self.succeed
        with patch.object(self.w.state, "save", side_effect=fail_second):
            self.assertIs(self.w.post("/ingest/events", {"ts": 31}, "event"), watcher.Delivery.HELD)
        self.assertTrue(self.w.state.d["outbox"][0]["acknowledged"])
        self.w.flush_outbox()
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.disk()["outbox"][0]["body"], {"ts": 31})

    def test_persisted_acknowledgment_settles_without_another_request(self):
        self.held()
        self.w.state.d["outbox"][0]["acknowledged"] = True
        self.w.state.save()
        restarted = watcher.Watcher(self.cfg)
        restarted.worker.call = lambda *a, **k: self.fail("UNEXPECTED", "UNEXPECTED")
        restarted.flush_outbox()
        self.assertEqual(restarted.state.d["outbox"], [])
        self.assertEqual(len(self.calls), 1)

    def test_legacy_original_cannot_be_silently_assigned_new_binding(self):
        original = {"path": "/ingest/events", "body": {"ts": 1}, "label": "old", "at": 1}
        self.w.state.d["outbox"] = [copy.deepcopy(original)]
        self.w.state.save()
        self.w.flush_outbox()
        self.assertEqual(self.calls, [])
        self.assertEqual(self.disk()["outbox"], [original])

    def test_changed_origin_token_officer_or_original_body_is_held(self):
        self.held()
        original = copy.deepcopy(self.w.state.d["outbox"][0])
        for field, value in [("base", "https://other.invalid"), ("token", "other-synthetic")]:
            before = getattr(self.w.worker, field); setattr(self.w.worker, field, value)
            self.w.flush_outbox(); setattr(self.w.worker, field, before)
        old = self.w.officer_id; self.w.officer_id = "Other Officer"; self.w.flush_outbox(); self.w.officer_id = old
        self.w.state.d["outbox"][0]["body"]["events"][0]["ts"] = 999
        self.w.flush_outbox()
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.disk()["outbox"][0], original)

    def test_known_refusal_is_recorded_as_retained_refusal_not_delivery_and_not_resent(self):
        # Real transport classification remains (True, None); the typed status is separate evidence.
        self.w.worker.call = watcher.Worker.call.__get__(self.w.worker)
        error = urllib.error.HTTPError("https://example.invalid/ingest/events", 400, "synthetic", {}, io.BytesIO(b"NEVER_LOG_REFUSAL"))
        with patch.object(self.w.worker.opener, "open", side_effect=error) as opened:
            self.assertIs(self.w.post("/ingest/events", {}, "event"), watcher.Delivery.HELD)
            self.w.flush_outbox()
        self.assertEqual(opened.call_count, 1)
        self.assertEqual(self.disk()["outbox"][0]["refusal_status"], 400)
        self.assertNotIn("NEVER_LOG_REFUSAL", self.logs.getvalue())

    def test_untyped_true_none_and_empty_2xx_are_not_application_receipts(self):
        self.w.worker.call = lambda *a, **k: (True, None)
        self.assertIs(self.w.post("/ingest/events", {}, "event"), watcher.Delivery.HELD)
        self.w.worker.call = watcher.Worker.call.__get__(self.w.worker)
        with patch.object(self.w.worker.opener, "open", return_value=io.BytesIO(b"")):
            self.w.flush_outbox()
        self.assertEqual(len(self.disk()["outbox"]), 1)
        self.assertNotIn("refusal_status", self.disk()["outbox"][0])

    def test_global_auth_pause_keeps_original_without_network_or_clock_refresh(self):
        self.w.worker.call = watcher.Worker.call.__get__(self.w.worker)
        self.w.state.d["worker_retry_at"] = time.time() + 900
        self.w.state.d["worker_retry_status"] = 401
        with patch.object(self.w.worker.opener, "open") as opened:
            self.assertIs(self.w.post("/ingest/events", {"ts": 8}, "event"), watcher.Delivery.HELD)
            before = copy.deepcopy(self.disk()["outbox"])
            self.w.flush_outbox()
        opened.assert_not_called()
        self.assertEqual(self.disk()["outbox"], before)

    def test_chat_backpressure_keeps_cursor_and_partial_siblings_are_not_duplicated(self):
        self.w.max_outbox = 1
        self.w.chat_log.write_text("synthetic filler\n" * 30, encoding="utf-8")
        self.w.tail_chat_log()
        cursor = self.w.state.d["chat_offset"]
        events = [self.code_event(name) for name in ["First", "Second"]]
        with self.w.chat_log.open("a", encoding="utf-8") as log:
            for event in events:
                log.write(f"10/23 12:00:00.000  {event['name']} whispers: !verify {event['code']}\n")
        with self.assertRaises(watcher.NoCustody):
            self.w.tail_chat_log()
        self.assertEqual(self.w.state.d["chat_offset"], cursor)
        self.assertTrue(self.w.state.was_seen(self.w.code_key("whisper", "First", events[0]["code"])))
        self.assertFalse(self.w.state.was_seen(self.w.code_key("whisper", "Second", events[1]["code"])))
        self.w.worker.call = self.succeed
        self.w.flush_outbox()
        self.w.tail_chat_log()
        sent = [c[2]["character"] for c in self.calls if c[1] == "/ingest/verify"]
        self.assertEqual(sent, ["First", "First", "Second"])
        self.assertEqual(self.w.state.d["chat_offset"], self.w.chat_log.stat().st_size)

    def test_saved_event_batch_commits_claims_together_and_keeps_completed_verification_sibling(self):
        self.w.max_outbox = 1
        now = int(time.time())
        event = {"type": "joined", "name": "Joined", "ts": now, "ok": True}
        verification = self.code_event("Verifier")
        with self.assertRaises(watcher.NoCustody):
            self.w.forward_events([event, event, verification])
        key = f"J:joined:{now // 600}"
        self.assertFalse(self.w.state.was_seen(key))
        self.w.worker.call = self.succeed
        self.w.flush_outbox()
        self.w.forward_events([event, event, verification])
        self.assertTrue(self.w.state.was_seen(key))
        event_posts = [c for c in self.calls if c[1] == "/ingest/events"]
        self.assertEqual(len(event_posts), 1)
        self.assertEqual(len(event_posts[0][2]["events"]), 1)
        self.assertEqual(len([c for c in self.calls if c[1] == "/ingest/verify"]), 2)  # initial + exact queued retry only

    def test_savedvars_mtime_and_roster_watermark_do_not_advance_without_custody(self):
        self.w.max_outbox = 0
        self.w.sv_file.write_text("synthetic placeholder", encoding="utf-8")
        data = {"OlympusVerifyDB": {"events": [self.code_event("Saved")], "roster": {"exportedAt": 123, "members": [{"name": "Saved"}]}}}
        with patch.object(watcher.savedvars, "parse_file", return_value=data), patch.object(watcher.time, "sleep"):
            with self.assertRaises(watcher.NoCustody):
                self.w.check_savedvars()
        self.assertEqual(self.w.state.d["sv_mtime"], 0)
        with self.assertRaises(watcher.NoCustody):
            self.w.forward_roster(data["OlympusVerifyDB"]["roster"])
        self.assertEqual(self.w.state.d["roster_sent"], 0)
        self.assertEqual(self.calls, [])

    def test_durable_held_roster_owns_original_and_advances_watermark_once(self):
        self.w.forward_roster({"exportedAt": 123, "members": [{"name": "Saved"}]})
        self.assertEqual(self.w.state.d["roster_sent"], 123)
        self.w.forward_roster({"exportedAt": 123, "members": [{"name": "Saved"}]})
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.disk()["outbox"][0]["body"]["exportedAt"], 123)

    def test_roster_watermark_and_original_share_one_pre_http_commit_across_restart(self):
        observed = []
        def transport(method, path, body=None, retries=3):
            observed.append(self.disk())
            return False, "unknown"
        self.w.worker.call = transport
        source = {"exportedAt": 321, "members": [{"name": "Original"}]}
        self.w.forward_roster(source)
        self.assertEqual(observed[0]["roster_sent"], 321)
        self.assertEqual(observed[0]["outbox"][0]["body"]["exportedAt"], 321)
        restarted = watcher.Watcher(self.cfg)
        restarted.worker.call = self.succeed
        restarted.forward_roster(source)
        self.assertEqual(self.calls, [])
        self.assertEqual(len(restarted.state.d["outbox"]), 1)

    def test_unreadable_existing_state_fails_closed_and_is_not_overwritten(self):
        for original in [b"not json", b'{"outbox":"invalid"}']:
            self.w.state.path.write_bytes(original)
            with self.assertRaisesRegex(ValueError, "original file retained"):
                watcher.Watcher(self.cfg)
            self.assertEqual(self.w.state.path.read_bytes(), original)

    def queue_transport(self, method, path, body=None, retries=3):
        self.calls.append((method, path, copy.deepcopy(body), retries))
        if path == "/queue/unverified":
            return True, {"members": [], "verified": []}
        if method == "GET" and path.startswith("/queue?"):
            return True, {"entries": [{"id": 7, "name": "Queued", "status": "queued"}], "setGuildNote": False}
        if path == "/queue/written":
            record = self.disk()["queue_written_original"]
            self.assertEqual(record["body"], body)
            self.assertEqual(self.disk()["queue_written_pending"], [7])
            return False, "unknown"
        self.fail("UNEXPECTED", path, body, retries)
        raise AssertionError("unexpected synthetic request")

    def test_queue_written_captures_actual_officer_body_before_http_and_never_merges_new_work(self):
        self.w.worker.call = self.queue_transport
        self.w.pull_queue()
        original = copy.deepcopy(self.disk()["queue_written_original"])
        self.assertEqual(original["body"], {"ids": [7], "officer": self.w.officer_id})
        self.assertTrue(self.w.queue_file.exists())
        self.w._last_queue_pull = 0
        self.w.pull_queue()
        self.assertEqual(self.disk()["queue_written_original"], original)
        self.assertEqual(len([c for c in self.calls if c[0] == "GET" and c[1].startswith("/queue?")]), 1)
        self.assertTrue(all(c[3] == 1 for c in self.calls if c[1] == "/queue/written"))

    def test_queue_written_restart_resends_only_original_and_settles_ids(self):
        self.w.worker.call = self.queue_transport
        self.w.pull_queue()
        original = copy.deepcopy(self.disk()["queue_written_original"])
        restarted = watcher.Watcher(self.cfg)
        restarted.worker.call = self.succeed
        self.assertIs(restarted.retry_queue_written(), watcher.Delivery.DELIVERED)
        self.assertEqual(self.calls[-1][2], original["body"])
        self.assertEqual(restarted.state.d["queue_written_pending"], [])
        self.assertIsNone(restarted.state.d["queue_written_original"])

    def test_bare_legacy_queue_ids_and_changed_owner_stay_held_without_http(self):
        self.w.state.d["queue_written_pending"] = [5]
        self.w.state.save()
        self.assertIs(self.w.retry_queue_written(), watcher.Delivery.HELD)
        self.w.pull_queue()
        self.assertEqual(self.calls, [])
        self.assertEqual(self.disk()["queue_written_pending"], [5])
        self.w.state.d["queue_written_original"] = self.w._freeze_original("/queue/written", {"ids": [5], "officer": self.w.officer_id}, "ack")
        self.w.state.save()
        self.w.officer_id = "Different Officer"
        self.assertIs(self.w.retry_queue_written(), watcher.Delivery.HELD)
        self.assertEqual(self.calls, [])

    def test_queue_written_persistence_failure_prevents_ack_http(self):
        self.w.worker.call = self.queue_transport
        with patch.object(self.w.state, "save", side_effect=OSError("synthetic save failure")):
            with self.assertRaises(watcher.NoCustody):
                self.w.pull_queue()
        self.assertFalse(any(c[1] == "/queue/written" for c in self.calls))
        self.assertTrue(self.w._custody_halted)
        self.assertEqual(self.disk()["queue_hash"], "")

    def test_queue_written_settlement_failure_retains_original_and_stops_dispatch(self):
        self.w.worker.call = self.queue_transport
        self.w.pull_queue()
        original = copy.deepcopy(self.disk()["queue_written_original"])
        self.w.worker.call = self.succeed
        with patch.object(self.w.state, "save", side_effect=OSError("synthetic ack settlement failure")):
            self.assertIs(self.w.retry_queue_written(), watcher.Delivery.HELD)
        self.assertEqual(self.w.state.d["queue_written_original"]["body"], original["body"])
        calls = len(self.calls)
        self.w.retry_queue_written()
        self.assertEqual(len(self.calls), calls)
        self.assertEqual(self.disk()["queue_written_pending"], [7])

    def test_no_protocol_auth_clock_limit_or_original_test_file_change_is_needed(self):
        self.assertEqual(self.w.max_outbox, 2)
        self.assertFalse(bool(watcher.Delivery.HELD))
        self.assertFalse(bool(watcher.Delivery.NO_CUSTODY))
        self.assertTrue(bool(watcher.Delivery.DELIVERED))
        self.assertNotIn(self.cfg["watcher_token"], self.w._delivery_binding())
        self.assertNotIn(self.cfg["watcher_token"], self.w.state.path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()

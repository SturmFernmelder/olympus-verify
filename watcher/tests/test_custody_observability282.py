"""Count-only local diagnostics; synthetic files, no configuration or provider."""
from __future__ import annotations

import copy
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import watcher


class StopLoop(BaseException):
    pass


class CustodyObservabilityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "Logs").mkdir()
        self.w = watcher.Watcher({"worker_url": "https://example.invalid", "watcher_token": "synthetic-only",
                                  "verify_secret": "synthetic-secret", "wow_dir": str(self.root),
                                  "account": "SYNTHETIC", "officer_character": "Synthetic",
                                  "state_file": str(self.root / "state.json"), "membership_only": True,
                                  "max_outbox": 5, "report_presence": False})

    def tearDown(self):
        self.tmp.cleanup()

    @staticmethod
    def private_row(**extra):
        return {"body": {"name": "PRIVATE-CHARACTER", "code": "PRIVATE-CODE", "id": "PRIVATE-ID"},
                "digest": "PRIVATE-DIGEST", **extra}

    def test_counts_are_local_and_do_not_infer_attempt_or_valid_delivery(self):
        self.w.state.d["outbox"] = [self.private_row(), self.private_row(acknowledged=True),
                                    self.private_row(refusal_status=409), self.private_row(acknowledged=False), None]
        before = copy.deepcopy(self.w.state.d)
        with patch.object(self.w.worker, "call") as call, patch.object(self.w.state, "save") as save:
            self.assertEqual(self.w._custody_outbox_counts282(), (5, 5, True, 3))
            summary = self.w._custody_outbox_summary282()
        self.assertIn("count=5; capacity=5; full=yes; unconfirmed=3", summary)
        self.assertIn("attempts not inferred", summary)
        for private in ("PRIVATE-CHARACTER", "PRIVATE-CODE", "PRIVATE-ID", "PRIVATE-DIGEST"):
            self.assertNotIn(private, summary)
        call.assert_not_called()
        save.assert_not_called()
        self.assertEqual(self.w.state.d, before)

    def test_invalid_refusal_markers_are_still_unconfirmed(self):
        values = [None, False, "PRIVATE-STATUS", 399, 500, 409.0]
        self.w.state.d["outbox"] = [self.private_row(refusal_status=value) for value in values]
        self.assertEqual(self.w._custody_outbox_counts282(), (6, 5, True, 6))
        self.w.state.d["outbox"] = [self.private_row(refusal_status=400), self.private_row(refusal_status=499)]
        self.assertEqual(self.w._custody_outbox_counts282(), (2, 5, False, 0))

    def test_empty_and_zero_capacity_boundaries(self):
        self.assertEqual(self.w._custody_outbox_counts282(), (0, 5, False, 0))
        self.w.max_outbox = 0
        self.assertEqual(self.w._custody_outbox_counts282(), (0, 0, True, 0))
        self.w.max_outbox = -1
        self.assertEqual(self.w._custody_outbox_counts282(), (0, 0, True, 0))

    def test_notices_use_transitions_and_sixty_second_cadence_only(self):
        self.w.state.d["outbox"] = [self.private_row()]
        before = copy.deepcopy(self.w.state.d)
        messages = []
        with patch.object(watcher, "log", side_effect=messages.append), \
                patch.object(watcher.time, "monotonic", side_effect=[100.0, 110.0, 159.0, 160.0, 161.0, 99.0, 200.0]), \
                patch.object(self.w.worker, "call") as call, patch.object(self.w.state, "save") as save:
            for _ in range(4):
                self.w._notice_custody_pressure282()
            self.assertEqual(len(messages), 2)
            self.w.max_outbox = 1
            self.w._notice_custody_pressure282()  # A capacity transition is immediate.
            self.w._notice_custody_pressure282()  # A backwards clock does not make a storm.
            self.w._notice_custody_pressure282()
        self.assertEqual(len(messages), 3)
        self.assertTrue(messages[-1].startswith("source capture held; outbox custody:"))
        self.assertIn("full=yes", messages[-1])
        self.assertNotIn("PRIVATE", "\n".join(messages))
        self.assertEqual(self.w.state.d, before)
        call.assert_not_called()
        save.assert_not_called()

    def test_nonfinite_clock_has_one_transition_then_a_finite_cadence_anchor(self):
        messages = []
        with patch.object(watcher, "log", side_effect=messages.append), \
                patch.object(watcher.time, "monotonic", side_effect=[float("nan"), float("inf"), 100.0, 159.0, 160.0]):
            for _ in range(5):
                self.w._notice_custody_pressure282()
        self.assertEqual(len(messages), 2)

    def test_no_custody_capture_notice_does_not_resume_poll_or_dispatch(self):
        self.w.state.d["outbox"] = [self.private_row() for _ in range(5)]
        before, raw = copy.deepcopy(self.w.state.d), self.w.state.path.read_bytes()
        self.w.require_launch_worker = Mock()
        self.w.recover_local_settlement = Mock(return_value=False)
        self.w.check_savedvars = Mock(side_effect=watcher.NoCustody("PRIVATE-ERROR"))
        self.w.flush_outbox = Mock()
        self.w.tail_chat_log = Mock()
        self.w.pull_launch_operations = Mock()
        self.w.pull_queue = Mock()
        messages = []
        with patch.object(watcher, "log", side_effect=messages.append), \
                patch.object(watcher.time, "sleep", side_effect=StopLoop), \
                patch.object(self.w.worker, "call") as call, patch.object(self.w.state, "save") as save:
            with self.assertRaises(StopLoop):
                self.w.run()
        self.assertTrue(any("count=5; capacity=5; full=yes; unconfirmed=5" in line for line in messages))
        self.assertIn("loop error: NoCustody", messages)
        self.assertNotIn("PRIVATE", "\n".join(messages))
        self.w.flush_outbox.assert_not_called()
        self.w.tail_chat_log.assert_not_called()
        self.w.pull_launch_operations.assert_not_called()
        self.w.pull_queue.assert_not_called()
        call.assert_not_called()
        save.assert_not_called()
        self.assertEqual(self.w.state.d, before)
        self.assertEqual(self.w.state.path.read_bytes(), raw)

    def test_check_reports_counts_without_additional_transport_or_state_writes(self):
        self.w.sv_file.parent.mkdir(parents=True, exist_ok=True)
        self.w.sv_file.write_text("-- synthetic source only\n", encoding="utf-8")
        self.w.queue_file.parent.mkdir(parents=True, exist_ok=True)
        self.w.state.d["outbox"] = [self.private_row(), self.private_row(acknowledged=True)]
        self.w.require_launch_worker = Mock()
        before, raw = copy.deepcopy(self.w.state.d), self.w.state.path.read_bytes()
        calls, messages = [], []
        def answer(method, path, body=None, retries=3):
            calls.append((method, path, body, retries))
            if path == "/queue?presenceOnly=1":
                return True, {"presenceOnly": True, "entries": []}
            if path == "/health":
                return True, {"relays": {"requestCodes": True}}
            raise AssertionError("unexpected transport")
        with patch.object(self.w.worker, "call", side_effect=answer), \
                patch.object(watcher, "log", side_effect=messages.append), patch.object(self.w.state, "save") as save:
            self.assertEqual(self.w.check(), 0)
        self.assertEqual(calls, [("GET", "/queue?presenceOnly=1", None, 1), ("GET", "/health", None, 1)])
        summary = [line for line in messages if line.startswith("outbox custody:")]
        self.assertEqual(len(summary), 1)
        self.assertIn("count=2; capacity=5; full=no; unconfirmed=1", summary[0])
        self.assertNotIn("PRIVATE", summary[0])
        self.assertEqual(self.w.state.d, before)
        self.assertEqual(self.w.state.path.read_bytes(), raw)
        save.assert_not_called()


if __name__ == "__main__":
    unittest.main()

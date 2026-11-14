"""Malformed retained attempt state cannot become known first-dispatch custody."""
from __future__ import annotations
import copy
import tempfile
from pathlib import Path
import sys
import time
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import watcher
import intake242


class IntakeAttemptCustody280(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup); self.root = Path(temp.name)
        self.cfg = dict(wow_dir=str(self.root), account="SYNTHETIC", worker_url="https://test.invalid", watcher_token="synthetic-token",
                        verify_secret="synthetic-key", officer_character="Officer", state_file=str(self.root / "state.json"), membership_only=True)
        self.body = dict(id="actual-retained-original", type="role", source="native-discord-event242", character="Synthetic Sender",
                         guid="Player-1-9999ABCD", requestedAt=int(time.time())-30)
        _, digest = intake242._canonical_body(self.body)
        self.base = dict(body=self.body, sha256=digest, state="pending")
        self.calls = []

    def reload(self, original):
        first = watcher.Watcher(self.cfg); first.state.d["intake242"] = {self.body["id"]: copy.deepcopy(original)}; first.state.save()
        loaded = watcher.Watcher(self.cfg); loaded.worker.paused = lambda: None
        loaded.worker.call = lambda *a, **k: (self.calls.append(copy.deepcopy(a)) or (False, {}))
        return loaded, loaded.state.d["intake242"][self.body["id"]]

    def test_actual_save_reload_malformed_attempt_variants_are_metadata_only_held(self):
        for label, value in [("missing", None), ("null", None), ("zero", 0), ("empty-string", ""), ("empty-list", []),
                             ("empty-object", {}), ("false-string", "false"), ("one", 1)]:
            with self.subTest(label=label):
                original = copy.deepcopy(self.base)
                if label != "missing": original["attempted"] = value
                loaded, row = self.reload(original); self.calls.clear()
                intake242.drain(loaded, False); intake242.drain(loaded, False)
                self.assertEqual(self.calls, []); self.assertEqual(row["custodyHold280"], "attempt_state_unqualified")
                self.assertEqual({k:v for k,v in row.items() if k != "custodyHold280"}, original)

    def test_literal_false_has_one_first_attempt_and_restart_cannot_repeat_unknown(self):
        loaded, row = self.reload({**self.base, "attempted": False})
        intake242.drain(loaded, False); intake242.drain(loaded, False); self.assertEqual(len(self.calls), 1)
        restarted, retained = self.reload(row); intake242.drain(restarted, False)
        self.assertEqual(len(self.calls), 1); self.assertTrue(retained["attempted"]); self.assertEqual(retained["body"], self.body)

    def test_literal_true_with_serialized_only_no_effect_metadata_never_acquires_witness(self):
        original = {**self.base, "attempted": True, "retrySchedule280": {"spent": False, "nextAt": 1, "receipt": {
            "id": self.body["id"], "character": self.body["character"], "guid": self.body["guid"], "originalNoEffect": True,
            "outcome": "approved_branch_authority_pending"}}}
        loaded, row = self.reload(original); intake242.drain(loaded, False)
        self.assertEqual(self.calls, []); self.assertTrue(row["attempted"]); self.assertEqual(row["body"], self.body)

    def test_forged_no_effect_metadata_does_not_authorize_missing_attempt_state(self):
        original = {**self.base, "retrySchedule280": {"spent": False, "nextAt": 1, "receipt": {"originalNoEffect": True}}}
        loaded, row = self.reload(original); intake242.drain(loaded, False)
        self.assertEqual(self.calls, []); self.assertNotIn("attempted", row); self.assertEqual(row["body"], self.body)

    def test_failed_metadata_hold_save_remains_global_custody_halt(self):
        loaded, row = self.reload(self.base)
        with patch.object(loaded.state, "save", side_effect=OSError("synthetic unavailable journal")):
            with self.assertRaises(OSError): intake242.drain(loaded, False)
        self.assertTrue(loaded._custody_halted); self.assertEqual(self.calls, []); self.assertNotIn("attempted", row)


if __name__ == "__main__": unittest.main()

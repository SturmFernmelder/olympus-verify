"""Confirmed roster delivery must wake display reads without replay or redating."""
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import watcher

class DisplayRefresh268Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.at = int(time.time())
        root = Path(self.tmp.name)
        self.w = watcher.Watcher(dict(wow_dir=str(root), account="LOCAL_TEST", worker_url="https://fixture.invalid",
            watcher_token="synthetic-only", verify_secret="synthetic-only", officer_character="Fern Melder",
            membership_only=True, state_file=str(root / "state.json")))
        self.w._next_strict_display_pull = self.at + 1800
        self.w._last_queue_pull = self.at
        self.body = dict(exportedAt=self.at, total=1, nativeGuild="OLYMPUS PRIME", nativeRealm="Fixture Realm",
            members=[dict(name="Fixture Member", guid="Player-1234-ABCDEF", rank="Member", rankIndex=8, level=60)])

    def tearDown(self):
        self.tmp.cleanup()

    def test_confirmed_upload_wakes_next_normal_display_poll(self):
        paths = []
        def call(method, path, body=None, retries=3):
            paths.append((method, path))
            if method == "POST": return True, {"trusted": True, "snapshot": 1, "members": 1}
            if "presenceOnly=1" in path: return True, {"presenceOnly": True}
            return True, {}
        self.w.worker.call = call
        self.w.forward_roster(self.body)
        with patch.object(self.w, "pull_strict_display") as display:
            self.w.pull_queue()
        self.assertEqual(display.call_count, 1)
        self.assertEqual(sum(m == "POST" for m, p in paths), 1)
        self.assertEqual(self.w._next_strict_display_pull, 0)
        self.assertFalse(self.w.state.d["outbox"])

    def test_unknown_upload_does_not_invalidate_or_replay(self):
        self.w.worker.call = lambda *a, **k: (False, None)
        self.w.forward_roster(self.body)
        self.assertEqual(self.w._next_strict_display_pull, self.at + 1800)
        self.assertEqual(self.w._last_queue_pull, self.at)
        self.assertTrue(self.w.state.d["outbox"])

    def test_failed_local_settlement_keeps_previous_list_and_cadence(self):
        self.w.strict_display_file.parent.mkdir(parents=True, exist_ok=True)
        self.w.strict_display_file.write_text("original dated list", encoding="utf-8")
        calls = []
        transport_returned = False
        def call(method, path, body=None, retries=3):
            nonlocal transport_returned
            calls.append(path)
            transport_returned = True
            return True, {"trusted": True, "snapshot": 1, "members": 1}
        self.w.worker.call = call
        save = self.w.state.save
        def fail_ack_save():
            if transport_returned:
                raise OSError("synthetic settlement refusal")
            return save()
        with patch.object(self.w.state, "save", side_effect=fail_ack_save):
            self.w.forward_roster(self.body)
        self.assertEqual(calls, ["/ingest/roster"])
        self.assertEqual(self.w._next_strict_display_pull, self.at + 1800)
        self.assertEqual(self.w.strict_display_file.read_text("utf-8"), "original dated list")
        self.assertTrue(self.w._custody_halted)
        self.assertTrue(self.w.state.d["outbox"][0]["acknowledged"])
        self.assertTrue(self.w.recover_local_settlement())
        self.assertEqual(calls, ["/ingest/roster"])
        self.assertEqual(self.w._next_strict_display_pull, 0)

if __name__ == "__main__": unittest.main()

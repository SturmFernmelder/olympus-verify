"""Synthetic process/lock tests only: no watcher configuration or network."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import custody_recovery as recovery
import watcher


HOLDER = """
from pathlib import Path
import sys
from custody_recovery import StateLease
with StateLease(Path(sys.argv[1])):
    Path(sys.argv[2]).write_text('locked', encoding='ascii')
    sys.stdin.buffer.read(1)
"""


class RestartTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.state = self.root / 'state.json'
        self.state.write_text('{}', encoding='utf-8')

    def tearDown(self):
        self.tmp.cleanup()

    def holder(self):
        ready = self.root / 'ready'
        process = subprocess.Popen(
            [sys.executable, '-c', HOLDER, str(self.state), str(ready)],
            cwd=Path(recovery.__file__).parent, stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        deadline = time.monotonic() + 5
        while not ready.exists() and process.poll() is None and time.monotonic() < deadline:
            time.sleep(0.01)
        if not ready.exists():
            if process.poll() is None:
                process.kill()
            stdout, stderr = process.communicate(timeout=5)
            self.fail(f'synthetic holder did not acquire: {stdout!r} {stderr!r}')
        return process

    @staticmethod
    def close_holder(process):
        if process.poll() is None:
            process.kill()
        process.communicate(timeout=5)

    def test_unclean_stop_releases_kernel_lock_without_deleting_lock_file(self):
        process = self.holder()
        try:
            # TerminateProcess/SIGKILL does not execute StateLease.__exit__.
            process.kill()
            process.communicate(timeout=5)
            lock = self.state.with_name(self.state.name + '.custody-lock')
            self.assertTrue(lock.exists())
            before = self.state.read_bytes()
            with recovery.StateLease(self.state):
                self.assertEqual(self.state.read_bytes(), before)
            self.assertTrue(lock.exists())
        finally:
            self.close_holder(process)

    def test_live_other_process_still_excludes_both_watcher_and_recovery(self):
        process = self.holder()
        try:
            before = self.state.read_bytes()
            with self.assertRaises(FileExistsError):
                with recovery.StateLease(self.state):
                    self.fail('live writer must remain exclusive')
            self.assertEqual(self.state.read_bytes(), before)
        finally:
            self.close_holder(process)

    def test_normal_release_keeps_same_lock_inode_for_next_owner(self):
        with recovery.StateLease(self.state) as lease:
            identity = recovery.regular_identity(lease.path)
        self.assertEqual(recovery.regular_identity(lease.path), identity)
        with recovery.StateLease(self.state) as second:
            self.assertEqual(recovery.regular_identity(second.path), identity)

    def test_legacy_pid_token_file_is_held_without_pid_or_age_reclaim(self):
        lock = self.state.with_name(self.state.name + '.custody-lock')
        raw = json.dumps({'pid': 99999999, 'at': 1, 'token': 'old'}).encode()
        lock.write_bytes(raw)
        with self.assertRaises(FileExistsError):
            with recovery.StateLease(self.state):
                self.fail('old writer format needs attended migration')
        self.assertEqual(lock.read_bytes(), raw)

    def test_hardlinked_lock_is_refused_without_mutating_either_name(self):
        lock = self.state.with_name(self.state.name + '.custody-lock')
        lock.write_bytes(b'unreviewed lock')
        alias = self.root / 'lock-alias'
        os.link(lock, alias)
        with self.assertRaises(ValueError):
            with recovery.StateLease(self.state):
                self.fail('hardlinked lock must remain refused')
        self.assertEqual(lock.read_bytes(), b'unreviewed lock')
        self.assertEqual(alias.read_bytes(), b'unreviewed lock')


class PersistenceRestartTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / 'Logs').mkdir()
        self.cfg = {'worker_url': 'https://example.invalid', 'watcher_token': 'synthetic-only',
                    'verify_secret': 'synthetic-secret', 'wow_dir': str(self.root),
                    'account': 'SYNTHETIC', 'officer_character': 'Synthetic',
                    'state_file': str(self.root / 'state.json')}
        self.w = watcher.Watcher(self.cfg)
        self.calls = []
        self.w.worker.call = self.transport

    def tearDown(self):
        self.tmp.cleanup()

    def transport(self, method, path, body=None, retries=3):
        self.calls.append((method, path, body, retries))
        return True, {'ok': True}

    def stop_after_failed_reservation(self, commit_first):
        save = self.w.state.save
        def failure():
            if commit_first:
                save()
            raise PermissionError(13, 'SYNTHETIC PRIVATE ERROR MUST NOT BE LOGGED')
        with patch.object(self.w.state, 'save', side_effect=failure), \
                patch.object(self.w, 'tail_chat_log', side_effect=lambda: self.w._post_claimed(
                    '/ingest/events', {'events': [{'ts': 51}]}, 'event', ['original-key'])), \
                patch.object(self.w, 'check_savedvars') as later_lane, \
                patch.object(watcher, 'log') as logger:
            with self.assertRaises(watcher.CustodyStopped):
                self.w.run()
            later_lane.assert_not_called()
        logs = ' '.join(str(call.args[0]) for call in logger.call_args_list)
        self.assertIn('reservation PermissionError errno=13', logs)
        self.assertNotIn('SYNTHETIC PRIVATE ERROR', logs)
        self.assertEqual(self.calls, [])

    def test_precommit_save_failure_exits_then_same_source_can_deliver_after_reload(self):
        self.stop_after_failed_reservation(False)
        restarted = watcher.Watcher(self.cfg)
        restarted.worker.call = self.transport
        self.assertFalse(restarted.state.was_seen('original-key'))
        self.assertEqual(restarted.state.d['outbox'], [])
        self.assertIs(restarted._post_claimed('/ingest/events', {'events': [{'ts': 51}]},
                                             'event', ['original-key']), watcher.Delivery.DELIVERED)
        self.assertEqual(len(self.calls), 1)

    def test_commit_then_error_exits_and_reload_uses_original_without_fabricating_new_work(self):
        self.stop_after_failed_reservation(True)
        restarted = watcher.Watcher(self.cfg)
        restarted.worker.call = self.transport
        self.assertTrue(restarted.state.was_seen('original-key'))
        original = json.loads(json.dumps(restarted.state.d['outbox'][0]))
        restarted.flush_outbox()
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.calls[0][2], original['body'])
        self.assertEqual(self.calls[0][3], 1)
        self.assertEqual(restarted.state.d['outbox'], [])


if __name__ == '__main__':
    unittest.main()

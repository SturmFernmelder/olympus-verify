"""Notify only from fresh, actually published and locally matched recommendations."""
import copy
import ctypes
import json
import unittest
from unittest.mock import Mock, patch

import test_initiate_checks300 as checks

watcher = checks.watcher


class NoticeTests(unittest.TestCase):
    def setUp(self):
        self.case = checks.InitiateChecks300Tests()
        self.addCleanup(self.case.doCleanups)
        self.case.setUp()
        self.w, self.f = self.case.w, self.case.f
        self.os = self.w._initiate_notice = Mock()
        self.os.available.return_value = self.os.show.return_value = True
        self.history = self.w._notice_history
        self.history.save(set(), None)  # Existing true-zero baseline.
        self.case.start()

    def page(self, *args, **kwargs):
        okay, reply = self.case.answer(*args, **kwargs)
        for rec in reply['page']['promotions']:
            name = next(row['name'] for row in self.case.roster['members'] if row['guid'] == rec['guid'])
            rec['name'] = rec['intent']['name'] = name
        return okay, reply

    def finish(self):
        with patch.object(self.w.worker, 'call', side_effect=self.page):
            self.w.pull_launch_operations()
            self.os.show.assert_not_called()
            self.f.at += 6
            self.w.pull_launch_operations()
        self.w.check_initiate_notice()

    def test_terminal_publication_coalesces_and_hashes_survive_restart(self):
        self.finish()
        self.os.show.assert_called_once_with()
        saved = json.loads(self.history.path.read_text(encoding='utf-8'))
        self.assertEqual(len(saved), 2)
        self.assertTrue(all(len(x) == 64 and set(x) <= set('0123456789abcdef') for x in saved))
        self.w._notice_history = watcher.initiate_notice.NoticeHistory(self.w.state.path)
        self.w.write_initiate_checks()
        self.w.check_initiate_notice()
        self.os.show.assert_called_once_with()
        self.assertNotIn(self.case.targets[0], watcher.initiate_notice.MESSAGE)

    def test_windows_suppression_never_claims_and_expired_notice_is_dropped(self):
        self.os.available.return_value = False
        self.finish()
        self.os.show.assert_not_called()
        self.assertFalse(self.history.load()[0])
        self.os.available.return_value = True
        self.f.at += 610
        self.w.check_initiate_notice()
        self.os.show.assert_not_called()
        self.assertIsNone(self.w._notice_check_at)

    def test_shell_refusal_releases_claim_and_known_safe_retry_succeeds(self):
        self.os.show.side_effect = [False, True]
        self.finish()
        self.assertFalse(self.history.load()[0])
        self.f.at += 21
        self.w.check_initiate_notice()
        self.assertEqual(self.os.show.call_count, 2)
        self.assertEqual(len(self.history.load()[0]), 2)

    def test_no_os_alert_after_savedvariables_changes_or_for_wrong_officer(self):
        self.os.available.return_value = False
        self.finish()
        self.os.available.return_value = True
        self.f.at += 21
        with patch.object(self.w, 'officer', 'Other Officer'):
            self.w.check_initiate_notice()
        self.w._notice_check_at = 0
        self.f.db['lastCharacterGuid'] = self.case.targets[0]
        self.f.write(replace=True)
        self.w.check_initiate_notice()
        self.os.show.assert_not_called()

    def test_missing_publication_or_wrong_native_name_has_no_announcement(self):
        with patch.object(self.w, '_write_projection280', return_value=None):
            self.finish()
        self.os.show.assert_not_called()
        # The actual source is intact, but the Worker's names must also match it.
        for read in self.w.initiate_checks:
            row = read.record['page']['promotions'][0]
            row['name'] = row['intent']['name'] = 'Other Name'
        self.w.write_initiate_checks()
        self.w.check_initiate_notice()
        self.os.show.assert_not_called()

    def test_held_outcome_preserves_notice_history_and_confirmed_zero_retires_it(self):
        self.finish()
        before = set(self.history.load()[0])
        self.w.initiate_checks[0].record.update(page=None, coveredGuids=[], completed=False, running=False, stoppedReason='source-refused')
        self.w.write_initiate_checks()
        self.w.check_initiate_notice()
        self.assertEqual(self.history.load()[0], before)
        del self.f.db['primeInitiateChecks']
        self.f.at += 2
        self.case.roster['exportedAt'] = self.f.at
        for member in self.case.roster['members'][1:]:
            member.update(rankIndex=8, rank=self.case.roster['nativeRankTable']['names'][8])
        self.case.start()
        self.w.check_initiate_notice()
        self.assertEqual(self.history.load()[0], set())
        self.os.show.assert_called_once_with()

    def test_confirmed_loss_then_new_qualification_notifies_once_more(self):
        self.finish()
        record = self.w.initiate_checks[0].record
        original = copy.deepcopy(record['page'])
        row = record['page']['promotions'].pop()
        record['page']['held'] = [dict(name=row['name'], guid=row['guid'], reason='unverified-initiate')]
        self.w.write_initiate_checks()
        self.w.check_initiate_notice()
        self.assertEqual(len(self.history.load()[0]), 1)
        record['page'] = original
        self.w.write_initiate_checks()
        self.w.check_initiate_notice()
        self.assertEqual(self.os.show.call_count, 2)

    def test_mismatched_negative_cannot_rearm_an_existing_recommendation(self):
        self.finish()
        record = self.w.initiate_checks[0].record
        original = copy.deepcopy(record['page'])
        row = record['page']['promotions'].pop()
        record['page']['held'] = [dict(name="Different Member", guid=row['guid'], reason='unverified-initiate')]
        self.w.write_initiate_checks()
        self.w.check_initiate_notice()
        self.assertEqual(len(self.history.load()[0]), 2)
        record['page'] = original
        self.w.write_initiate_checks()
        self.w.check_initiate_notice()
        self.os.show.assert_called_once_with()

    def test_windows_receives_only_static_text_and_realtime_quiet_flags(self):
        adapter = watcher.initiate_notice.WindowsNotice()
        dll = Mock()
        dll.user32.CreateWindowExW.return_value = 27
        dll.user32.LoadIconW.return_value = 45
        captured = []
        def capture(operation, data):
            icon = data._obj
            captured.append((operation, icon.uFlags, icon.dwInfoFlags, icon.szInfoTitle, icon.szInfo))
            return 1
        dll.shell32.Shell_NotifyIconW.side_effect = capture
        with patch.object(watcher.initiate_notice.os, 'name', 'nt'), patch.object(ctypes, 'windll', dll, create=True):
            self.assertTrue(adapter.show())
            self.assertTrue(adapter.show(test=True))
            adapter.remove_at = 0
            adapter.tidy()
        self.assertEqual([r[0] for r in captured], [0, 1, 1, 2])
        self.assertEqual(captured[1][1:], (0x50, 0x91, 'Olympus Verify', watcher.initiate_notice.MESSAGE))
        self.assertEqual(captured[2][-1], watcher.initiate_notice.TEST_MESSAGE)

    def test_first_complete_baseline_is_silent_including_existing_eligible(self):
        self.history.path.unlink()
        self.finish()
        self.assertEqual(len(self.history.load()[0]), 2)
        self.os.show.assert_not_called()
        self.assertEqual(len(watcher.initiate_notice.NoticeHistory(self.w.state.path).load()[0]), 2)

    def test_first_real_empty_baseline_then_newly_ready_emits(self):
        self.history.path.unlink()
        def known_empty(*args, **kwargs):
            okay, reply = self.page(*args, **kwargs)
            row = reply['page']['promotions'].pop()
            reply['page']['held'] = [dict(name=row['name'], guid=row['guid'], reason='unverified-initiate')]
            return okay, reply
        with patch.object(self.w.worker,'call',side_effect=known_empty):
            self.w.pull_launch_operations()
            self.f.at += 7
            self.w.pull_launch_operations()
        self.w.check_initiate_notice()
        self.assertEqual(watcher.initiate_notice.NoticeHistory(self.w.state.path).load()[0], set())
        self.os.show.assert_not_called()
        self.w.handle_chat_line(self.f.line())
        self.assertEqual(len(self.f.verify_paths()), 1)
        self.f.at += 8
        self.case.at = self.f.at
        self.case.roster['exportedAt'] = self.f.at-1
        for i, c in enumerate(self.case.controls):
            c.update(id=f'{self.f.at}:{i+1}', observedAt=self.f.at)
        self.case.resign()
        self.case.start()
        self.finish()
        self.os.show.assert_called_once_with()

    def test_optional_write_failure_keeps_ingest_and_original_replay_guard_working(self):
        # Actually attempt exclusive file creation at an existing directory;
        # only the optional sidecar's creation fails.
        real_create = watcher.initiate_notice.private_create
        with patch.object(watcher.initiate_notice, 'private_create', side_effect=lambda path: real_create(path.parent)):
            self.finish()
        self.os.show.assert_not_called()
        self.assertEqual(self.history.load()[0], set())
        self.assertFalse(self.w._custody_halted)
        self.w.handle_chat_line(self.f.line())
        self.w.handle_chat_line(self.f.line())
        self.assertEqual(len(self.f.verify_paths()), 1)
        self.assertNotIn('initiate_notice_active', json.loads(self.w.state.path.read_text(encoding='utf-8')))
        self.f.at += 21
        self.w.check_initiate_notice()
        self.os.show.assert_called_once_with()
        self.assertEqual(len(self.history.load()[0]), 2)

    def test_sidecar_stale_writer_cannot_replace_newer_deduplication(self):
        unused, witness = self.history.load()
        self.history.save({'1'*64}, witness)
        with self.assertRaises(watcher.initiate_notice.NoticeHistoryUnavailable):
            self.history.save({'2'*64}, witness)
        self.assertEqual(self.history.load()[0], {'1'*64})

"""Actual scan/watcher rate-limit recovery; synthetic GET responses and local files only."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import urllib.parse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import launch_operations229 as launch
import watcher
from test_launch_operations229 import page


class RateRecovery(unittest.TestCase):
    def setUp(self):
        self.at = 1900000000
        self.clock = float(self.at)
        self.calls = []

    def scan(self):
        scan = launch.Scan(lambda: self.clock)
        self.assertTrue(scan.request(dict(action='scan', id='original-control',
                                         scopeHash=page(self.at)['scopeHash']), self.clock))
        scan.expected_snapshot = (12, self.at - 10)
        return scan

    def transport(self, response):
        def call(method, path, body=None, retries=3):
            self.assertEqual((method, body, retries), ('GET', None, 1))
            self.calls.append((self.clock, path))
            return response(path) if callable(response) else response
        return call

    def current_page(self, offset=0, total=40):
        return page(int(self.clock), offset, total, self.at)

    def limited(self, offset=0, total=40, delay=7):
        report = self.current_page(offset, total)
        report['status'] = 'partial'
        report['entitlements']['retryAfterSeconds'] = delay
        report['heldReasons'].append('discord-rate-limited')
        report['nextCursor'] = None  # the actual Worker withholds nextCursor after Discord 429
        return report

    def tick(self, scan, response, advance=0):
        self.clock += advance
        return scan.step(self.transport(response), self.clock)

    def assert_cursor(self, index, value):
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.calls[index][1]).query)
        self.assertEqual(query.get('cursor'), [value])

    def test_first_inner429_retries_own_page_zero_before_advancing(self):
        scan = self.scan()
        limited = self.limited()
        scan.step(self.transport((True, limited)), self.clock)
        original = copy.deepcopy(scan.pages[0])
        self.assertEqual((scan.phase, scan.stopped, scan.calls), ('discover', 'rate-limited-wait', 1))
        self.assertTrue(scan.result()['running'])
        self.assertIn('stoppedReason="rate-limited-wait"', launch.render_pages(scan.result(), self.at))
        self.assertFalse(self.tick(scan, (True, self.current_page()), 6))
        self.assertEqual(scan.pages[0], original)
        self.assertTrue(self.tick(scan, lambda _: (True, self.current_page()), 1))
        self.assert_cursor(1, original['pageCursor'])
        self.assertEqual(scan.pages[0]['scan'], original['scan'])
        self.assertEqual((scan.pages[0]['snapshotId'], scan.pages[0]['snapshotAt']), (12, self.at - 10))
        self.assertEqual((scan.control_id, scan.stopped, scan.calls, scan.rate_retries), ('original-control', None, 2, {0: 1}))
        self.assertTrue(self.tick(scan, lambda _: (True, self.current_page(20)), 5))
        self.assert_cursor(2, 'opaque-cursor-20')
        self.assertTrue(scan.complete)

    def test_later_inner429_keeps_page_zero_and_retries_exact_offset20(self):
        scan = self.scan()
        self.tick(scan, (True, self.current_page()))
        original = copy.deepcopy(scan.pages[0])
        self.tick(scan, lambda _: (True, self.limited(20)), 5)
        self.assertEqual(scan.rate_retry, (20, 'page-20'))
        self.tick(scan, lambda _: (True, self.current_page(20)), 7)
        self.assert_cursor(2, 'page-20')
        self.assertEqual(scan.pages[0], original)
        self.assertEqual(scan.pages[20]['scan'], original['scan'])
        self.assertTrue(scan.complete)

    def test_outer429_uses_captured_next_cursor_and_no_new_scan(self):
        scan = self.scan()
        self.tick(scan, (True, self.current_page()))
        original = copy.deepcopy(scan.pages[0])
        self.tick(scan, (False, dict(httpStatus=429, retryAfterSeconds=8)), 5)
        self.assertEqual(scan.rate_retry, (20, 'opaque-cursor-20'))
        self.tick(scan, lambda _: (True, self.current_page(20)), 8)
        self.assertEqual(self.calls[1][1], self.calls[2][1])
        self.assertEqual(scan.pages[0], original)
        self.assertTrue(scan.complete)

    def test_refresh_retry_remains_in_original_refresh_budget_and_cooldown(self):
        scan = self.scan()
        self.tick(scan, (True, self.current_page(total=20)))
        self.clock += 5
        self.assertTrue(scan.request(dict(action='recheck', offset=0, id='chosen-page', scopeHash=scan.scope_hash), self.clock))
        self.tick(scan, (False, dict(httpStatus=429, retryAfterSeconds=1)))
        self.assertFalse(self.tick(scan, (True, self.current_page(total=20)), 4))
        self.tick(scan, lambda _: (True, self.current_page(total=20)), 1)
        self.assertEqual((scan.calls, scan.refreshed, scan.rate_retries, scan.stopped), (3, 2, {0: 1}, None))
        self.assertEqual(self.calls[1][1], self.calls[2][1])
        self.assertGreaterEqual(self.calls[2][0] - self.calls[1][0], 5)

    def test_repeated429_exhausts_two_automatic_retries_without_reset(self):
        scan = self.scan()
        for index in range(3):
            self.tick(scan, lambda _: (True, self.limited(delay=1)), 0 if index == 0 else 5)
        self.assertEqual((scan.calls, scan.rate_retries, scan.stopped, scan.phase),
                         (3, {0: 2}, 'rate-limit-retries-exhausted', 'idle'))
        self.assertFalse(self.tick(scan, (True, self.current_page()), 60))
        self.assertEqual(len(self.calls), 3)
        self.assertFalse(scan.request(dict(action='recheck', offset=0, id='cannot-reset', scopeHash=scan.scope_hash), self.clock))

    def test_success_and_explicit_rechecks_do_not_reset_per_page_retry_cap(self):
        scan = self.scan(); self.tick(scan, (True, self.limited(total=20, delay=1)))
        self.tick(scan, lambda _: (True, self.current_page(total=20)), 5)
        for index in range(2):
            self.clock += 5
            self.assertTrue(scan.request(dict(action='recheck', offset=0, id=str(index), scopeHash=scan.scope_hash), self.clock))
            self.tick(scan, (False, dict(httpStatus=429, retryAfterSeconds=1)))
            if index == 0:
                self.tick(scan, lambda _: (True, self.current_page(total=20)), 5)
                self.assertEqual(scan.rate_retries, {0: 2})
        self.assertEqual((scan.calls, scan.refreshed, scan.stopped), (5, 4, 'rate-limit-retries-exhausted'))
        self.assertFalse(scan.defer_rate_limit(5))
        self.assertEqual(scan.stopped, 'rate-limit-retries-exhausted')

    def test_two_discovery_retries_preserve_full_1000_scan_and_spend_shared_pool(self):
        scan = self.scan()
        self.tick(scan, (True, self.limited(total=1000, delay=1)))
        original_scan = copy.deepcopy(scan.pages[0]['scan'])
        self.tick(scan, lambda _: (True, self.limited(total=1000, delay=1)), 5)
        self.tick(scan, lambda _: (True, self.current_page(total=1000)), 5)
        while scan.phase != 'idle':
            def answer(path):
                query = urllib.parse.parse_qs(urllib.parse.urlsplit(path).query)
                cursor = query['cursor'][0]
                offset = int(cursor.rsplit('-', 1)[1])
                return True, self.current_page(offset, 1000)
            self.tick(scan, answer, 5)
        self.assertEqual((scan.calls, scan.refreshed, len(scan.pages), len(self.calls)), (52, 2, 50, 52))
        self.assertIsNone(scan.stopped)
        self.assertTrue(scan.complete)
        self.assertEqual(sorted(scan.pages), list(range(0, 1000, 20)))
        self.assertTrue(all(value['scan'] == original_scan for value in scan.pages.values()))
        self.assertEqual(scan.pages[980]['entitlements']['unscanned'], 0)
        self.assertEqual(scan.rate_retries, {0: 2})
        self.assert_cursor(1, 'page-0'); self.assert_cursor(2, 'page-0')
        self.assertEqual(scan.result()['refreshedPages'], 2)
        self.assertFalse(self.tick(scan, (False, 'no automatic final refresh'), 5))
        for index in range(48):
            self.clock += 5
            self.assertTrue(scan.request(dict(action='recheck', offset=index*20,
                                             id='chosen-'+str(index), scopeHash=scan.scope_hash), self.clock))
            self.tick(scan, lambda _: (True, self.current_page(index*20, 1000)))
        self.assertEqual((scan.calls, scan.refreshed, len(self.calls)), (100, 50, 100))
        self.assertFalse(scan.request(dict(action='recheck', offset=0, id='spent',
                                          scopeHash=scan.scope_hash), self.clock+5))
        self.assertTrue(all(later[0]-earlier[0] >= 5 for earlier,later in zip(self.calls,self.calls[1:])))
        self.assertLess(self.clock, original_scan['expiresAt'])
        self.assertEqual(scan.pages[0]['scan'], original_scan)

    def test_last_discovery_page_can_use_shared_retry_pool(self):
        scan = self.scan()
        for offset in range(0, 1000, 20):
            response = self.limited(offset, 1000, 1) if offset == 980 else self.current_page(offset, 1000)
            self.tick(scan, (True, response), 0 if offset == 0 else 5)
        self.assertEqual((scan.calls, scan.refreshed, scan.phase), (50, 0, 'discover'))
        self.assertEqual(scan.rate_retry, (980, 'page-980'))
        self.tick(scan, lambda _: (True, self.current_page(980, 1000)), 5)
        self.assertEqual((scan.calls, scan.refreshed, len(scan.pages), scan.complete), (51, 1, 50, True))
        self.assertIsNone(scan.stopped)
        self.assert_cursor(50, 'page-980')

    def test_fifty_shared_retries_allow_fifty_distinct_pages_but_never_101st_get(self):
        scan = self.scan()
        for offset in range(0, 1000, 20):
            response = self.limited(offset, 1000, 1) if offset < 500 else self.current_page(offset, 1000)
            self.tick(scan, (True, response), 0 if offset == 0 else 5)
            if offset < 500:
                self.tick(scan, lambda _: (True, self.limited(offset, 1000, 1)), 5)
                self.tick(scan, lambda _: (True, self.current_page(offset, 1000)), 5)
        self.assertEqual((scan.calls, scan.refreshed, len(scan.pages), len(self.calls)), (100, 50, 50, 100))
        self.assertTrue(scan.complete)
        self.assertIsNone(scan.stopped)
        self.assertTrue(all(count == 2 for count in scan.rate_retries.values()))
        self.assertFalse(scan.request(dict(action='recheck', offset=0, id='spent',
                                          scopeHash=scan.scope_hash), self.clock+5))
        self.assertFalse(self.tick(scan, (False, 'no automatic 101st GET'), 5))
        self.assertEqual(len(self.calls), 100)

    def test_exhausted_shared_pool_stops_a_discovery_retry_before_transport(self):
        scan = self.scan()
        for offset in range(0, 500, 20):
            self.tick(scan, lambda _: (True, self.limited(offset, 1000, 1)), 0 if offset == 0 else 5)
            self.tick(scan, lambda _: (True, self.limited(offset, 1000, 1)), 5)
            self.tick(scan, lambda _: (True, self.current_page(offset, 1000)), 5)
        self.assertEqual((scan.calls, scan.refreshed), (75, 50))
        self.tick(scan, lambda _: (True, self.limited(500, 1000, 1)), 5)
        original = copy.deepcopy(scan.pages)
        self.assertEqual((scan.calls, scan.refreshed, scan.stopped), (76, 50, 'refresh-budget-exhausted'))
        self.assertFalse(self.tick(scan, (True, self.current_page(500, 1000)), 5))
        self.assertEqual((len(self.calls), scan.pages), (76, original))
        self.assertFalse(scan.complete)
        self.assertIsNone(scan.rate_retry)

    def test_fifty_distinct_discovery_attempts_do_not_allow_offset_1000(self):
        scan = self.scan()
        for offset in range(0, 1000, 20):
            def answer(_):
                report = self.current_page(offset, 1000)
                if offset == 980:
                    report.update(status='partial', nextCursor='unbounded-continuation')
                return True, report
            self.tick(scan, answer, 0 if offset == 0 else 5)
        self.assertEqual((scan.calls, scan.refreshed, scan.phase), (50, 0, 'discover'))
        self.assertTrue(self.tick(scan, (False, 'must not fetch page51'), 5))
        self.assertEqual((scan.calls, len(self.calls), scan.stopped), (50, 50, 'discovery-budget-exhausted'))
        self.assertFalse(scan.complete)

    def test_refresh_retry_spends_original_fifty_refresh_ceiling(self):
        scan = self.scan()
        self.tick(scan, (True, self.current_page(total=20)))
        for index in range(49):
            self.clock += 5
            self.assertTrue(scan.request(dict(action='recheck', offset=0, id=str(index), scopeHash=scan.scope_hash), self.clock))
            self.tick(scan, lambda _: (True, self.current_page(total=20)) if index < 48 else
                      (False, dict(httpStatus=429, retryAfterSeconds=1)))
        self.tick(scan, (False, dict(httpStatus=429, retryAfterSeconds=1)), 5)
        self.assertEqual((scan.calls, scan.refreshed, len(self.calls)), (51, 50, 51))
        self.assertEqual(scan.stopped, 'refresh-budget-exhausted')
        self.assertFalse(self.tick(scan, (True, self.current_page(total=20)), 5))

    def test_scan_deadline_or_operator_stop_cancels_wait_without_another_get(self):
        for action in ('deadline', 'stop', 'scope'):
            with self.subTest(action=action):
                self.clock = float(self.at); self.calls = []
                scan = self.scan(); self.tick(scan, (True, self.limited(delay=7)))
                if action == 'deadline':
                    self.clock = scan.pages[0]['scan']['expiresAt']
                    self.assertTrue(scan.step(self.transport((True, self.current_page())), self.clock))
                    self.assertEqual(scan.stopped, 'scan-expired')
                else:
                    if action == 'stop':
                        self.assertTrue(scan.request(dict(action='stop', id='stop-now'), self.clock))
                    else:
                        scan._stop('native-roster-changed-or-expired')
                    self.assertFalse(self.tick(scan, (True, self.current_page()), 7))
                self.assertEqual(len(self.calls), 1)
                self.assertIsNone(scan.rate_retry)

    def test_delay_at_or_beyond_original_deadline_is_terminal(self):
        scan = self.scan(); self.tick(scan, (True, self.limited(delay=590)))
        self.assertEqual(scan.stopped, 'rate-limit-exceeds-scan')
        self.assertFalse(self.tick(scan, (True, self.current_page()), 590))
        self.assertEqual(len(self.calls), 1)

    def test_first_outer429_and_auth_or_unknown_refusal_never_restart(self):
        for response in ((False, dict(httpStatus=429, retryAfterSeconds=10)),
                         (False, dict(httpStatus=401, retryAfterSeconds=10)),
                         (False, dict(httpStatus=403, retryAfterSeconds=10)), (False, 'unknown')):
            with self.subTest(response=response):
                self.clock = float(self.at); self.calls = []
                scan = self.scan(); self.tick(scan, response)
                self.assertEqual((scan.stopped, scan.calls, scan.pages), ('source-refused', 1, {}))
                self.assertFalse(self.tick(scan, (True, self.current_page()), 60))

    def test_bad_recovery_response_is_terminal_and_preserves_prior_page(self):
        for change in (lambda p: p.update(snapshotId=13), lambda p: p['scan'].update(id='b'*32),
                       lambda p: p.update(scopeHash='0'*16), lambda p: p.update(unknown='not-allowed')):
            with self.subTest(change=change):
                self.clock = float(self.at); self.calls = []
                scan = self.scan(); self.tick(scan, (True, self.limited()))
                original = copy.deepcopy(scan.pages[0]); self.clock += 7
                altered = self.current_page(); change(altered)
                self.tick(scan, (True, altered))
                self.assertEqual(scan.phase, 'idle')
                self.assertIsNotNone(scan.stopped)
                self.assertEqual(scan.pages[0], original)
                self.assertIsNone(scan.rate_retry)

    def test_unknown_transport_and_invalid_retry_hint_cannot_revive_wait(self):
        for response in ((False, dict(httpStatus=401, retryAfterSeconds=7)),
                         (False, dict(httpStatus=403, retryAfterSeconds=7)),
                         (False, dict(httpStatus=429, retryAfterSeconds=float('inf'))),
                         (False, dict(httpStatus=429, retryAfterSeconds=True)), (False, 'unknown')):
            with self.subTest(response=response):
                self.clock = float(self.at); self.calls = []
                scan = self.scan(); self.tick(scan, (True, self.limited()))
                prior = copy.deepcopy(scan.pages[0])
                self.tick(scan, response, 7)
                self.assertEqual((scan.phase, scan.stopped, scan.calls), ('idle', 'source-refused', 2))
                self.assertEqual(scan.pages[0], prior)
                self.assertIsNone(scan.rate_retry)
        scan = self.scan(); self.tick(scan, (True, self.limited()))
        self.clock += 7
        def unknown(*args, **kwargs):
            raise OSError('synthetic unavailable read')
        scan.step(unknown, self.clock)
        self.assertEqual((scan.stopped, scan.calls), ('source-unknown', 2))
        self.assertIsNone(scan.rate_retry)

    def watcher(self, root, scan):
        instance = watcher.Watcher(dict(wow_dir=str(root), account='synthetic', worker_url='https://test.invalid',
                                       watcher_token='synthetic-token', verify_secret='synthetic-secret',
                                       officer_character='Fern Melder', membership_only=True, state_file=str(root/'state.json')))
        instance.queue_file.parent.mkdir(parents=True)
        instance.queue_file.write_text('LEGACY UNCHANGED')
        instance.launch_scan = scan
        return instance

    def test_shared_worker_pause_does_not_spend_gets_or_extend_original_scan(self):
        scan = self.scan(); self.tick(scan, (True, self.limited()))
        original = copy.deepcopy(scan.pages[0])
        with tempfile.TemporaryDirectory() as temporary, patch.object(watcher.time, 'time', side_effect=lambda: self.clock):
            instance = self.watcher(Path(temporary), scan)
            instance.worker.call = self.transport(lambda _: (True, self.current_page()))
            instance.worker._pause_for(429, 20, 'synthetic pause')
            before = copy.deepcopy(instance.state.d)
            self.clock += 7
            instance.pull_launch_operations()
            self.assertEqual((scan.calls, scan.refreshed, scan.rate_retries, len(self.calls)), (1, 0, {}, 1))
            self.assertEqual(scan.pages[0], original)
            self.clock += 13; instance.pull_launch_operations()
            self.assertEqual((scan.calls, scan.rate_retries), (2, {0: 1}))
            self.assertEqual(scan.pages[0]['scan'], original['scan'])
            self.assertEqual(instance.queue_file.read_text(), 'LEGACY UNCHANGED')
            self.assertEqual(instance.state.d, before)
            self.assertNotIn('pageCursor', instance.launch_operations_file.read_text())

    def test_auth_pause_or_expiry_cancels_wait_without_a_request(self):
        for status in (401, 403, 429):
            with self.subTest(status=status), tempfile.TemporaryDirectory() as temporary, patch.object(watcher.time, 'time', side_effect=lambda: self.clock):
                self.clock = float(self.at); self.calls = []
                scan = self.scan(); self.tick(scan, (True, self.limited()))
                instance = self.watcher(Path(temporary), scan)
                instance.worker.call = self.transport((False, 'must not call'))
                instance.worker._pause_for(status, 900 if status != 429 else 20, 'synthetic pause')
                if status == 429:
                    self.clock = scan.pages[0]['scan']['expiresAt']
                instance.pull_launch_operations()
                self.assertEqual((scan.phase, scan.calls, len(self.calls)), ('idle', 1, 1))
                self.assertEqual(scan.stopped, 'scan-expired' if status == 429 else 'source-refused')

    def test_process_restart_has_no_retry_scan_or_accepted_native_receipt(self):
        scan = self.scan(); self.tick(scan, (True, self.limited()))
        with tempfile.TemporaryDirectory() as temporary, patch.object(watcher.time, 'time', side_effect=lambda: self.clock):
            root = Path(temporary)
            first = self.watcher(root, scan); first.write_launch_operations()
            before = first.launch_operations_file.read_bytes()
            restarted = watcher.Watcher(first.cfg)
            restarted.worker.call = self.transport((False, 'must not call'))
            restarted.pull_launch_operations()
            self.assertEqual((restarted.launch_scan.phase, restarted.launch_scan.calls), ('idle', 0))
            self.assertIsNone(restarted._launch_accepted_roster)
            self.assertEqual(restarted.launch_operations_file.read_bytes(), before)
            self.assertEqual(len(self.calls), 1)

    def test_actual_watcher_native_roster_or_scope_change_cancels_recovery(self):
        for change in ('same-source', 'rank', 'guild', 'realm'):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as temporary, patch.object(watcher.time, 'time', side_effect=lambda: self.clock):
                self.clock = float(self.at); self.calls = []
                scan = self.scan(); self.tick(scan, (True, self.limited(total=1)))
                instance = self.watcher(Path(temporary), scan)
                roster = dict(exportedAt=self.at-10, total=1, online=1, nativeGuild='OLYMPUS PRIME', nativeRealm='Native Realm',
                              members=[dict(name='Fern Melder', guid='Player-1-0000AAAA', rank='High Council', rankIndex=1, level=60)])
                instance.state.d['roster_sent'] = roster['exportedAt']
                scope = {key: roster[key] for key in ('nativeGuild', 'nativeRealm')}
                instance.state.d['roster_scope_hash'] = hashlib.sha256(json.dumps(scope, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
                accepted = dict(digest=launch.complete_roster_digest(roster), exportedAt=roster['exportedAt'], snapshot=12)
                instance._launch_accepted_roster = accepted
                original_scan = copy.deepcopy(scan.pages[0]['scan'])
                roster['exportedAt'] = self.at
                if change == 'rank':
                    roster['members'][0].update(rank='Guild Master', rankIndex=0)
                elif change == 'guild':
                    roster['nativeGuild'] = 'Olympus II'
                elif change == 'realm':
                    roster['nativeRealm'] = 'Different Realm'
                # Existing native export dispatch is outside recovery. Intercept it;
                # no provider or original-custody route is exercised by these tests.
                with patch.object(instance, 'post', return_value=watcher.Delivery.DELIVERED) as post:
                    instance.forward_roster(roster)
                    self.assertEqual(post.call_count, 0 if change == 'same-source' else 1)
                self.assertEqual(scan.pages[0]['scan'], original_scan)
                instance.worker.call = self.transport(lambda _: (True, self.current_page(total=1)))
                self.clock += 7; instance.pull_launch_operations()
                if change == 'same-source':
                    self.assertIs(instance._launch_accepted_roster, accepted)
                    self.assertEqual((scan.calls, scan.stopped), (2, None))
                else:
                    self.assertEqual((scan.calls, scan.stopped), (1, 'native-roster-changed-or-expired'))
                    self.assertIsNone(instance._launch_accepted_roster)
                    self.assertIsNone(scan.rate_retry)
                self.assertEqual(instance.queue_file.read_text(), 'LEGACY UNCHANGED')


if __name__ == '__main__':
    unittest.main()

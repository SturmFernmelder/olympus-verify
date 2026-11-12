"""Real Watcher.run + Scan timing, with synthetic jobs/HTTP and a virtual clock."""
import copy
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import urllib.parse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import launch_operations229 as launch
import watcher
from test_launch_operations229 import page


class StopLoop(BaseException):
    pass


class MainLoopTiming(unittest.TestCase):
    def setUp(self):
        self.at = 1900000000
        self.clock = float(self.at)
        self.events = []
        self.requests = []
        self.sleeps = []
        self.loop = 0

    def fixture(self, *, total=60, active=True, membership=True, loops=7,
                queue_seconds=0, prefix_seconds=0, response_seconds=0.5,
                stop_on_read=False, halted=False, paused=False, poll=2.0, transient_offsets=()):
        instance = watcher.Watcher.__new__(watcher.Watcher)
        instance.membership_only = membership
        instance.poll = poll
        instance._custody_halted = halted
        instance._ack_settlement_pending = None
        instance._last_lag_report = self.at
        instance.state = SimpleNamespace(d={'lag': {}})
        instance.chat_log = Path('synthetic-chat.log')
        instance.sv_file = Path('synthetic-savedvariables.lua')
        scan = launch.Scan(lambda: self.clock)
        if active:
            self.assertTrue(scan.request(dict(action='scan', id='one-original-control',
                                             scopeHash=page(self.at)['scopeHash']), self.clock))
        instance.launch_scan = scan

        def event(name, duration=0):
            self.events.append((self.loop, name, self.clock))
            self.clock += duration

        attempts = {}
        def call(method, path, body=None, retries=3):
            self.assertEqual((method, body, retries), ('GET', None, 1))
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(path).query)
            cursor = query.get('cursor', [None])[0]
            offset = int(cursor.rsplit('-', 1)[1]) if cursor else 0
            start = self.clock
            event('launch-get', response_seconds)
            self.requests.append((self.loop, start, self.clock, offset))
            report = page(int(self.clock), offset, total, self.at)
            attempts[offset] = attempts.get(offset, 0) + 1
            if offset in transient_offsets and attempts[offset] == 1:
                report.update(status='partial', nextCursor=None)
                report['entitlements']['retryAfterSeconds'] = 1
                report['heldReasons'].append('discord-rate-limited')
            return True, report

        instance.worker = SimpleNamespace(call=call, paused=lambda:
            dict(httpStatus=429, retryAfterSeconds=10) if paused else None)
        instance.require_launch_worker = lambda: event('startup')
        instance.recover_local_settlement = lambda: event('settlement')
        actual_custody = watcher.Watcher._require_custody_continuation
        def custody():
            event('custody')
            actual_custody(instance)
        instance._require_custody_continuation = custody
        def savedvars():
            event('savedvars')
            if stop_on_read:
                self.assertTrue(scan.request(dict(action='stop', id='explicit-stop'), self.clock))
        instance.check_savedvars = savedvars
        instance.flush_outbox = lambda: event('outbox', prefix_seconds)
        instance.tail_chat_log = lambda: event('chat', prefix_seconds)
        actual_launch = watcher.Watcher.pull_launch_operations
        def launch_step():
            event('launch-step')
            actual_launch(instance)
        instance.pull_launch_operations = launch_step
        instance.write_launch_operations = lambda: event('projection-write')
        instance.pull_queue = lambda: event('queue', queue_seconds)
        def diagnostics():
            event('diagnostics')
            self.loop += 1
            if self.loop >= loops:
                raise StopLoop()
        instance.scan_diag_logs = diagnostics
        self.instance = instance
        return instance

    def run_loop(self, instance, expected=StopLoop):
        def sleep(delay):
            self.assertGreaterEqual(delay, 1.0)
            self.assertLessEqual(delay, instance.poll)
            self.sleeps.append(delay)
            if len(self.sleeps) > 1000:
                raise AssertionError('main loop failed to reach its bounded stop')
            self.clock += delay
        with patch.object(watcher.time, 'time', side_effect=lambda: self.clock), \
                patch.object(watcher.time, 'sleep', side_effect=sleep), \
                patch.object(watcher, 'log'), self.assertRaises(expected):
            instance.run()

    def test_five_second_deadline_is_not_rounded_to_six_by_two_second_poll(self):
        instance = self.fixture()
        self.run_loop(instance)
        self.assertEqual(len(self.requests), 3)
        self.assertEqual([start - previous[2] for previous, (_, start, _, _) in
                          zip(self.requests, self.requests[1:])], [5.0, 5.0])
        self.assertIn(1.0, self.sleeps)
        self.assertTrue(instance.launch_scan.complete)
        self.assertEqual(instance.launch_scan.refreshed, 0)

    def test_due_scan_runs_before_queue_reads_without_skipping_ordinary_jobs(self):
        instance = self.fixture(queue_seconds=4, loops=3)
        self.run_loop(instance)
        self.assertEqual(len(self.requests), 3)
        for loop in range(3):
            names = [name for number, name, _ in self.events if number == loop]
            self.assertEqual([name for name in names if name != 'projection-write'],
                             ['startup', 'settlement', 'custody', 'savedvars', 'outbox', 'custody',
                              'chat', 'launch-step', 'launch-get', 'queue', 'diagnostics'] if loop == 0 else
                             ['settlement', 'custody', 'savedvars', 'outbox', 'custody', 'chat',
                              'launch-step', 'launch-get', 'queue', 'diagnostics'])
        self.assertTrue(all(later[1] - earlier[2] >= 5 for earlier, later in zip(self.requests, self.requests[1:])))

    def test_full_1000_scan_keeps_all_jobs_budgets_original_deadline_and_single_step(self):
        instance = self.fixture(total=1000, loops=50, queue_seconds=3.5, prefix_seconds=0.05,
                                response_seconds=0.2)
        self.run_loop(instance)
        scan = instance.launch_scan
        self.assertEqual((scan.calls, scan.refreshed, len(scan.pages), scan.complete), (50, 0, 50, True))
        self.assertEqual([offset for _, _, _, offset in self.requests], list(range(0, 1000, 20)))
        self.assertEqual(scan.rate_retries, {})
        self.assertEqual(scan.control_id, 'one-original-control')
        self.assertIsNone(scan.stopped)
        self.assertEqual(scan.pages[0]['scan']['expiresAt'], self.at + 590)
        self.assertTrue(all(p['scan'] == scan.pages[0]['scan'] for p in scan.pages.values()))
        self.assertLess(self.clock, scan.pages[0]['scan']['expiresAt'])
        self.assertTrue(all(later[1] - earlier[2] >= 5 for earlier, later in zip(self.requests, self.requests[1:])))
        for name in ('settlement', 'savedvars', 'outbox', 'chat', 'launch-step', 'queue', 'diagnostics'):
            self.assertEqual(sum(event == name for _, event, _ in self.events), 50, name)
        self.assertEqual(len({loop for loop, _, _, _ in self.requests}), 50)

    def test_observed_cost_simulation_finishes_1000_with_five_retries_before_original_expiry(self):
        # Actual .272 observation: 139.422/39 ~= 3.5749s per remote GET,
        # median post-response gap8.9465s. A supported5s poll plus3.8465s
        # queue work and0.1s other work reproduces that old-loop gap. This
        # models plausible measured costs, not the private live configuration
        # or a guarantee about future network latency/whole-scan acceptance.
        instance = self.fixture(total=1000, loops=55, poll=5.0, response_seconds=3.5749,
                                queue_seconds=3.8465, prefix_seconds=0.05,
                                transient_offsets=(0, 20, 40, 60, 80))
        self.run_loop(instance)
        scan = instance.launch_scan
        self.assertEqual((scan.calls, scan.refreshed, len(scan.pages), scan.complete), (55, 5, 50, True))
        self.assertIsNone(scan.stopped)
        self.assertEqual(scan.rate_retries, {offset: 1 for offset in (0, 20, 40, 60, 80)})
        self.assertEqual(scan.control_id, 'one-original-control')
        self.assertEqual(scan.pages[0]['scan']['expiresAt'], self.at+590)
        self.assertTrue(all(p['scan'] == scan.pages[0]['scan'] for p in scan.pages.values()))
        self.assertLess(self.clock, scan.pages[0]['scan']['expiresAt'])
        self.assertTrue(all(later[1]-earlier[2] >= 5 for earlier,later in zip(self.requests,self.requests[1:])))
        for name in ('settlement', 'savedvars', 'outbox', 'chat', 'launch-step', 'queue', 'diagnostics'):
            self.assertEqual(sum(event == name for _,event,_ in self.events), 55, name)
        self.assertEqual(len({loop for loop,_,_,_ in self.requests}), 55)

    def test_explicit_stop_is_read_before_any_launch_get(self):
        instance = self.fixture(stop_on_read=True, loops=1)
        self.run_loop(instance)
        self.assertEqual((self.requests, instance.launch_scan.stopped), ([], 'operator-stopped'))
        self.assertIn('queue', [name for _, name, _ in self.events])

    def test_actual_custody_failure_prevents_launch_or_ordinary_transport(self):
        instance = self.fixture(halted=True)
        self.run_loop(instance, watcher.CustodyStopped)
        self.assertEqual(self.requests, [])
        self.assertEqual(self.sleeps, [])
        self.assertFalse(any(name in ('outbox', 'chat', 'launch-step', 'queue') for _, name, _ in self.events))

    def test_shared_pause_waits_without_extra_get_or_busy_loop(self):
        instance = self.fixture(paused=True, loops=3)
        instance.launch_scan.step(instance.worker.call, self.clock)
        original = copy.deepcopy(instance.launch_scan.pages[0]['scan'])
        self.run_loop(instance)
        self.assertEqual(len(self.requests), 1)
        self.assertEqual((instance.launch_scan.calls, instance.launch_scan.refreshed), (1, 0))
        self.assertEqual(instance.launch_scan.stopped, 'rate-limited-wait')
        self.assertEqual(instance.launch_scan.pages[0]['scan'], original)
        self.assertEqual(self.sleeps, [2.0, 2.0])

    def test_expired_scan_stays_stopped_while_normal_jobs_continue(self):
        instance = self.fixture(loops=1)
        instance.launch_scan.step(instance.worker.call, self.clock)
        self.clock = instance.launch_scan.pages[0]['scan']['expiresAt']
        self.run_loop(instance)
        self.assertEqual((len(self.requests), instance.launch_scan.calls), (1, 1))
        self.assertEqual(instance.launch_scan.stopped, 'scan-expired')
        self.assertIn('queue', [name for _, name, _ in self.events])

    def test_idle_and_legacy_modes_keep_original_poll_sleep(self):
        for membership, active in ((True, False), (False, True)):
            with self.subTest(membership=membership):
                self.setUp()
                instance = self.fixture(membership=membership, active=active, loops=3)
                self.run_loop(instance)
                self.assertEqual(self.requests, [])
                self.assertEqual(self.sleeps, [2.0, 2.0])


if __name__ == '__main__':
    unittest.main()

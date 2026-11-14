"""Actual Watcher.run/Scan and completed SavedVariables intake; local synthetic inputs only."""
import copy
import os
from pathlib import Path
import sys
import tempfile
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
        self.events, self.requests, self.sleeps, self.waits, self.logs = [], [], [], [], []
        self.loop = 0
        self.in_launch = False
        self.wait_hook = None

    def fixture(self, *, total=60, loops=6, poll=2.0, prefix_costs=(0.0,), queue_costs=(0.0,),
                response_seconds=0.5, transient_offsets=(), active=True, membership=True,
                stop_when_complete=False, consume=True, read_stop_file=False):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        instance = watcher.Watcher(dict(wow_dir=temporary.name, account='synthetic', worker_url='https://test.invalid',
            watcher_token='synthetic-token', verify_secret='synthetic-secret', officer_character='Fern Melder',
            membership_only=membership, state_file=str(Path(temporary.name)/'state.json')))
        instance.membership_only = membership
        instance.poll = poll
        instance._custody_halted = False
        instance._ack_settlement_pending = None
        instance._last_lag_report = self.at
        instance.state = SimpleNamespace(d={'lag': {}, 'sv_mtime': 0})
        instance.chat_log = Path(temporary.name)/'synthetic-chat.log'
        instance.sv_file = Path(temporary.name)/'synthetic-savedvariables.lua'
        instance.sv_file.write_text('OlympusVerifyDB = { events = {} }', encoding='utf-8')
        instance._launch_consumed_sv_witness = None
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
            attempts[offset] = attempts.get(offset, 0)+1
            if offset in transient_offsets and attempts[offset] == 1:
                report.update(status='partial', nextCursor=None)
                report['entitlements']['retryAfterSeconds'] = 1
                report['heldReasons'].append('discord-rate-limited')
            return True, report
        instance.worker = SimpleNamespace(call=call, paused=lambda: None)
        instance.require_launch_worker = lambda: event('startup')
        instance.recover_local_settlement = lambda: event('settlement')
        actual_custody = watcher.Watcher._require_custody_continuation
        def custody():
            event('custody')
            actual_custody(instance)
        instance._require_custody_continuation = custody
        def savedvars():
            event('savedvars')
            if read_stop_file and instance.sv_file.is_file() and instance.sv_file.read_text() == 'stop':
                scan.request(dict(action='stop', id='explicit-stop'), self.clock)
            if consume:
                instance._launch_consumed_sv_witness = instance._launch_savedvars_witness()
        instance.check_savedvars = savedvars
        instance.flush_outbox = lambda: event('outbox', prefix_costs[self.loop % len(prefix_costs)]/2)
        instance.tail_chat_log = lambda: event('chat', prefix_costs[self.loop % len(prefix_costs)]/2)
        actual_launch = watcher.Watcher.pull_launch_operations
        def launch_step():
            event('launch-step')
            self.in_launch = True
            try:
                actual_launch(instance)
            finally:
                self.in_launch = False
        instance.pull_launch_operations = launch_step
        instance.write_launch_operations = lambda: event('projection-write')
        instance.pull_queue = lambda: event('queue', queue_costs[self.loop % len(queue_costs)])
        def diagnostics():
            event('diagnostics')
            self.loop += 1
            if self.loop >= loops or stop_when_complete and scan.complete:
                raise StopLoop()
        instance.scan_diag_logs = diagnostics
        self.instance = instance
        return instance

    def run_loop(self, instance, expected=StopLoop):
        def sleep(delay):
            if self.in_launch:
                self.assertGreater(delay, 0)
                self.assertLessEqual(delay, 5)
                self.waits.append(delay)
                self.events.append((self.loop, 'admission-wait', self.clock))
            else:
                self.assertEqual(delay, instance.poll)
                self.assertGreaterEqual(delay, 1)
                self.sleeps.append(delay)
            if len(self.sleeps)+len(self.waits) > 1000:
                raise AssertionError('bounded test did not stop')
            self.clock += delay
            if self.in_launch and self.wait_hook:
                self.wait_hook(instance)
        with patch.object(watcher.time, 'time', side_effect=lambda: self.clock), \
                patch.object(watcher.time, 'monotonic', side_effect=lambda: self.clock-self.at), \
                patch.object(watcher.time, 'sleep', side_effect=sleep), \
                patch.object(watcher, 'log', side_effect=self.logs.append), self.assertRaises(expected):
            instance.run()

    def assert_bounds_and_jobs(self, instance):
        self.assertTrue(all(later[1]-earlier[2] >= 5 for earlier, later in zip(self.requests, self.requests[1:])))
        self.assertEqual(len({loop for loop, _, _, _ in self.requests}), len(self.requests))
        for loop in range(self.loop):
            self.assertLessEqual(sum(number == loop and name == 'admission-wait' for number, name, _ in self.events), 1)
        for name in ('settlement', 'savedvars', 'outbox', 'chat', 'launch-step', 'queue', 'diagnostics'):
            self.assertEqual(sum(event == name for _, event, _ in self.events), self.loop, name)
        self.assertLessEqual(instance.launch_scan.calls, 100)
        self.assertLessEqual(instance.launch_scan.calls-instance.launch_scan.refreshed, 50)
        self.assertLessEqual(instance.launch_scan.refreshed, 50)
        self.assertTrue(all(count <= 2 for count in instance.launch_scan.rate_retries.values()))
        self.assertEqual(instance.launch_scan.control_id, 'one-original-control')
        if instance.launch_scan.pages:
            self.assertTrue(all(p['scan']['expiresAt'] == self.at+590 for p in instance.launch_scan.pages.values()))
            self.assertTrue(all(p['expiresAt'] == p['fetchedAt']+60 for p in instance.launch_scan.pages.values()))

    def seed_page(self, instance):
        instance._launch_consumed_sv_witness = instance._launch_savedvars_witness()
        instance.launch_scan.step(instance.worker.call, self.clock)

    def test_poll_one_two_five_constant_and_tiny_alternating_prefixes(self):
        for poll in (1.0, 2.0, 5.0):
            for costs in ((1.0,), (2.275,), (2.441,), (4.0,), (2.275, 2.441), (0.1, 0.2)):
                with self.subTest(poll=poll, prefix=costs):
                    self.setUp()
                    instance = self.fixture(total=100, loops=12, poll=poll, prefix_costs=costs, stop_when_complete=True)
                    self.run_loop(instance)
                    self.assertEqual((instance.launch_scan.calls, len(instance.launch_scan.pages), instance.launch_scan.complete), (5, 5, True))
                    self.assertEqual(self.loop, 5)
                    self.assert_bounds_and_jobs(instance)
                    if poll+max(costs) <= 5:
                        self.assertTrue(all(abs(later[1]-earlier[2]-5) < 0.00001 for earlier, later in zip(self.requests, self.requests[1:])))

    def test_full_1000_eleven_retries_historical_client_phase_sensitivity(self):
        # .33 measured 183.451/54s in its request/render launch phase. Here it
        # calibrates synthetic future response work; new admission waits are
        # additional launch-phase time. None of these profiles proves live E2E.
        self.profile_results = []
        for costs in ((1.0,), (2.448,), (2.275, 2.441), (1.0, 4.0, 2.441, 2.275)):
            with self.subTest(prefix=costs):
                self.setUp()
                instance = self.fixture(total=1000, loops=150, poll=2.0, prefix_costs=costs,
                                        queue_costs=(0.0, 0.4, 1.2, 2.4), response_seconds=183.451/54,
                                        transient_offsets=tuple(range(0, 220, 20)), stop_when_complete=True)
                self.run_loop(instance)
                scan = instance.launch_scan
                self.assertEqual((scan.calls, scan.refreshed, len(scan.pages), scan.complete), (61, 11, 50, True))
                self.assertIsNone(scan.stopped)
                self.assertLess(self.clock, self.at+590)
                self.assert_bounds_and_jobs(instance)
                self.profile_results.append(dict(prefixSeconds=list(costs), elapsedSeconds=self.clock-self.at,
                                                 remainingSeconds=self.at+590-self.clock, loops=self.loop))

    def test_alternating_prefix_zero_queue_completes_without_predictor_bubble(self):
        instance = self.fixture(total=1000, loops=150, poll=2.0, prefix_costs=(2.275, 2.441),
                                response_seconds=183.451/54, transient_offsets=tuple(range(0, 220, 20)),
                                stop_when_complete=True)
        self.run_loop(instance)
        self.assertEqual((instance.launch_scan.calls, instance.launch_scan.refreshed,
                          len(instance.launch_scan.pages), instance.launch_scan.complete), (61, 11, 50, True))
        self.assertLess(self.clock, self.at+590)
        self.assert_bounds_and_jobs(instance)

    def test_requested_965_seven_retry_historical_mean_cost_profile(self):
        # Historical .33 observed means; repeating them for a future run is a
        # synthetic sensitivity scenario, not a native/recheck acceptance claim.
        instance = self.fixture(total=965, loops=120, poll=2.0,
                                prefix_costs=(136.179/54,), queue_costs=(28.191/54,),
                                response_seconds=183.451/54, transient_offsets=tuple(range(0, 140, 20)),
                                stop_when_complete=True)
        self.run_loop(instance)
        scan = instance.launch_scan
        self.assertEqual((scan.calls, scan.refreshed, len(scan.pages), scan.complete), (56, 7, 49, True))
        self.assertEqual(sum(p['entitlements']['scanned'] for p in scan.pages.values()), 965)
        self.assertEqual(scan.pages[960]['entitlements']['unscanned'], 0)
        self.assertLess(self.clock, self.at+590)
        self.assert_bounds_and_jobs(instance)
        self.requested_size_result = dict(elapsedSeconds=self.clock-self.at,
                                         remainingSeconds=self.at+590-self.clock, loops=self.loop)

    def test_slow_network_work_holds_original_expiry_and_keeps_normal_jobs(self):
        instance = self.fixture(total=1000, loops=75, poll=2.0, prefix_costs=(2.275, 2.441),
                                response_seconds=9, transient_offsets=tuple(range(0, 220, 20)))
        self.run_loop(instance)
        self.assertFalse(instance.launch_scan.complete)
        self.assertIn(instance.launch_scan.stopped, ('scan-expired', 'invalid-page'))
        self.assertLess(len(instance.launch_scan.pages), 50)
        self.assertTrue(all(start < self.at+590 for _, start, _, _ in self.requests))
        self.assert_bounds_and_jobs(instance)

    def test_no_wait_for_bootstrap_idle_and_long_cooldown(self):
        for mode in ('bootstrap', 'idle', 'long-cooldown'):
            with self.subTest(mode=mode):
                self.setUp()
                instance = self.fixture(total=1000, loops=1, active=mode != 'idle')
                if mode == 'bootstrap':
                    instance.launch_scan.next_at = self.clock+3
                elif mode == 'long-cooldown':
                    self.seed_page(instance)
                    instance.launch_scan._rate_wait(0, instance.launch_scan.pages[0]['pageCursor'], 12)
                self.run_loop(instance)
                self.assertEqual(self.waits, [])
                self.assertEqual(len(self.requests), 1 if mode == 'long-cooldown' else 0)

    def test_established_twelve_second_retry_and_global_defer_wait_exact_due(self):
        for retry in (True, False):
            with self.subTest(retry=retry):
                self.setUp()
                instance = self.fixture(total=1000, loops=3, poll=2.0, prefix_costs=(2.441,))
                self.seed_page(instance)
                original = copy.deepcopy(instance.launch_scan.pages[0]['scan'])
                if retry:
                    instance.launch_scan._rate_wait(0, instance.launch_scan.pages[0]['pageCursor'], 12)
                else:
                    instance.launch_scan.defer_rate_limit(12)
                due = instance.launch_scan.next_at
                self.run_loop(instance)
                self.assertEqual((len(self.requests), len(self.waits)), (2, 1))
                self.assertAlmostEqual(self.requests[1][1], due, places=5)
                self.assertAlmostEqual(self.requests[1][1]-self.requests[0][2], 12.0, places=5)
                self.assertEqual(instance.launch_scan.refreshed, 1 if retry else 0)
                self.assertEqual(instance.launch_scan.rate_retries, {0: 1} if retry else {})
                self.assertEqual(instance.launch_scan.pages[0]['scan'], original)
                self.assertIsNone(instance.launch_scan.stopped)

    def test_unknown_consumption_or_missing_nonregular_file_never_dispatches(self):
        for mode in ('unconsumed', 'missing', 'directory', 'zero-inode'):
            with self.subTest(mode=mode):
                self.setUp()
                instance = self.fixture(total=1000, loops=2, consume=False)
                if mode == 'missing': instance.sv_file.unlink()
                elif mode == 'directory': instance.sv_file.unlink(); instance.sv_file.mkdir()
                elif mode == 'zero-inode':
                    actual = instance.sv_file.lstat()
                    bad = SimpleNamespace(**{name: getattr(actual, name) for name in ('st_mode', 'st_dev', 'st_mtime_ns', 'st_ctime_ns', 'st_size')}, st_ino=0)
                    with patch.object(Path, 'lstat', return_value=bad):
                        self.assertIsNone(instance._launch_savedvars_witness())
                self.run_loop(instance)
                self.assertEqual((self.requests, self.waits), ([], []))

    def test_changed_during_prefix_blocks_already_due_get_until_normal_stop_read(self):
        instance = self.fixture(total=1000, loops=2, read_stop_file=True)
        self.seed_page(instance); self.clock += 5
        original = instance.tail_chat_log
        changed = {'done': False}
        def change():
            original()
            if not changed['done']:
                instance.sv_file.write_text('stop'); changed['done'] = True
        instance.tail_chat_log = change
        self.run_loop(instance)
        self.assertEqual(len(self.requests), 1)
        self.assertEqual(self.waits, [])
        self.assertEqual(instance.launch_scan.stopped, 'operator-stopped')
        self.assertEqual(sum(name == 'savedvars' for _, name, _ in self.events), 2)

    def test_file_changes_during_wait_skip_get_and_never_reenter_intake(self):
        for mode in ('changed', 'replaced', 'missing', 'directory'):
            with self.subTest(mode=mode):
                self.setUp()
                instance = self.fixture(total=1000, loops=1)
                self.seed_page(instance)
                before = instance.sv_file.stat()
                def change(target):
                    if mode == 'changed': target.sv_file.write_text('changed bytes')
                    elif mode == 'replaced':
                        replacement = target.sv_file.with_suffix('.replacement')
                        replacement.write_bytes(target.sv_file.read_bytes())
                        os.utime(replacement, ns=(before.st_atime_ns, before.st_mtime_ns))
                        os.replace(replacement, target.sv_file)
                    else:
                        target.sv_file.unlink()
                        if mode == 'directory': target.sv_file.mkdir()
                self.wait_hook = change
                self.run_loop(instance)
                self.assertEqual(len(self.requests), 1)
                self.assertEqual(len(self.waits), 1)
                self.assertEqual(sum(name == 'savedvars' for _, name, _ in self.events), 1)

    def test_stop_written_during_wait_is_read_only_on_next_normal_prefix(self):
        instance = self.fixture(total=1000, loops=2, read_stop_file=True)
        self.seed_page(instance)
        self.wait_hook = lambda target: target.sv_file.write_text('stop')
        self.run_loop(instance)
        self.assertEqual((len(self.requests), len(self.waits)), (1, 1))
        self.assertEqual(instance.launch_scan.stopped, 'operator-stopped')
        self.assertEqual(sum(name == 'savedvars' for _, name, _ in self.events), 2)

    def test_custody_pause_and_expiry_are_rechecked_after_wait(self):
        for mode in ('custody', 'auth', 'rate-limit', 'expiry'):
            with self.subTest(mode=mode):
                self.setUp()
                instance = self.fixture(total=1000, loops=1)
                if mode == 'expiry': self.clock = self.at+587
                self.seed_page(instance)
                status = {'pause': None}
                instance.worker.paused = lambda: status['pause']
                def changed(target):
                    if mode == 'custody': target._custody_halted = True
                    elif mode in ('auth', 'rate-limit'):
                        status['pause'] = dict(httpStatus=403) if mode == 'auth' else dict(httpStatus=429, retryAfterSeconds=10)
                self.wait_hook = changed
                self.run_loop(instance, watcher.CustodyStopped if mode == 'custody' else StopLoop)
                self.assertEqual((len(self.requests), len(self.waits)), (1, 1))
                if mode == 'auth': self.assertEqual(instance.launch_scan.stopped, 'source-refused')
                elif mode == 'rate-limit': self.assertEqual(instance.launch_scan.stopped, 'rate-limited-wait')
                elif mode == 'expiry': self.assertEqual(instance.launch_scan.stopped, 'scan-expired')

    def test_expired_source_or_existing_global_pause_does_not_wait(self):
        for mode in ('expired', 'pause'):
            with self.subTest(mode=mode):
                self.setUp()
                instance = self.fixture(total=1000, loops=1)
                self.seed_page(instance)
                if mode == 'expired': self.clock = self.at+590
                else: instance.worker.paused = lambda: dict(httpStatus=429, retryAfterSeconds=10)
                self.run_loop(instance)
                self.assertEqual((len(self.requests), self.waits), (1, []))

    def test_idle_and_legacy_modes_keep_configured_outer_poll(self):
        for membership, active in ((True, False), (False, True)):
            with self.subTest(membership=membership):
                self.setUp()
                instance = self.fixture(loops=3, poll=2.0, membership=membership, active=active)
                self.run_loop(instance)
                self.assertEqual((self.requests, self.waits, self.sleeps), ([], [], [2.0, 2.0]))
                for loop in range(3):
                    names = [name for number, name, _ in self.events if number == loop]
                    self.assertEqual(sum(name == 'savedvars' for name in names), 1)
                    if not membership:
                        self.assertGreater(names.index('savedvars'), names.index('chat'))
                    else:
                        self.assertLess(names.index('savedvars'), names.index('outbox'))

    def test_ordinary_job_order_and_fixed_label_timing_include_wait(self):
        instance = self.fixture(total=1000, loops=3, prefix_costs=(2.275, 2.441))
        self.run_loop(instance)
        self.assertGreater(len(self.waits), 0)
        mandatory = ('settlement', 'savedvars', 'outbox', 'chat', 'launch-step', 'queue', 'diagnostics')
        for loop in range(3):
            self.assertEqual([name for number, name, _ in self.events if number == loop and name in mandatory], list(mandatory))
        timings = [line for line in self.logs if line.startswith('launch timing:')]
        self.assertEqual(len(timings), 2)  # final synthetic StopLoop exits before its timing log
        for line in timings:
            self.assertRegex(line, r'^launch timing: prefix=\d+\.\d{3}s; launch-phase=\d+\.\d{3}s; tail=\d+\.\d{3}s; planned-sleep=2\.000s$')
        self.assertIn('launch-phase=1.059s', timings[1])  # .559s admission wait plus .5s synthetic HTTP
        self.assert_bounds_and_jobs(instance)


class CompletedIntakeWitness(unittest.TestCase):
    def fixture(self):
        temporary = tempfile.TemporaryDirectory(); self.addCleanup(temporary.cleanup)
        instance = watcher.Watcher(dict(wow_dir=temporary.name, account='synthetic', worker_url='https://test.invalid',
            watcher_token='synthetic-token', verify_secret='synthetic-secret', officer_character='Fern Melder',
            membership_only=True, state_file=str(Path(temporary.name)/'state.json')))
        instance.membership_only = True
        instance.sv_file = Path(temporary.name)/'SavedVariables.lua'
        instance.sv_file.write_text('OlympusVerifyDB = { events = {} }', encoding='utf-8')
        instance._launch_consumed_sv_witness = None
        instance._verification_sv_stamp = None
        self.steps = []
        instance.state = SimpleNamespace(d={'sv_mtime': 0}, save=lambda: self.steps.append('save'))
        instance.purge_treasury_receipts = lambda: None
        instance.note_saved_relay = lambda *args: None
        instance.valid_launch_control = lambda db: None
        instance.forward_roster = lambda *args, **kwargs: self.steps.append('roster')
        instance.forward_events = lambda events: self.steps.append('events')
        instance.read_launch_control = lambda db: self.steps.append('control')
        return instance

    def read(self, instance):
        with patch.object(watcher.intake242, 'collect'), patch.object(watcher.intake242, 'drain'), patch.object(watcher.time, 'sleep'):
            instance.check_savedvars()

    def test_only_completed_control_handling_and_save_issue_witness(self):
        instance = self.fixture()
        original = instance._launch_savedvars_witness()
        self.read(instance)
        self.assertEqual(self.steps, ['roster', 'events', 'control', 'save'])
        self.assertEqual(instance._launch_consumed_sv_witness, original)
        self.read(instance)
        self.assertEqual(instance._launch_consumed_sv_witness, original)
        self.assertEqual(self.steps, ['roster', 'events', 'control', 'save'])

    def test_verification_deferred_never_issues_consumed_witness(self):
        instance = self.fixture()
        def deferred(events): raise watcher.VerificationDeferred('synthetic deferred source')
        instance.forward_events = deferred
        self.read(instance)
        self.assertIsNotNone(instance._verification_sv_stamp)  # parsed stamp alone is insufficient
        self.assertIsNone(instance._launch_consumed_sv_witness)
        self.assertEqual(instance.state.d['sv_mtime'], 0)
        self.assertEqual(self.steps, ['roster'])

    def test_failed_save_cannot_be_recovered_from_in_memory_cursor_alone(self):
        instance = self.fixture()
        def failed(): raise OSError('synthetic state-save failure')
        instance.state.save = failed
        with self.assertRaises(OSError): self.read(instance)
        self.assertGreater(instance.state.d['sv_mtime'], 0)
        self.assertIsNone(instance._launch_consumed_sv_witness)
        instance.state.save = lambda: self.steps.append('save')
        self.read(instance)
        self.assertIsNone(instance._launch_consumed_sv_witness)

    def test_actual_state_control_claim_failures_halt_before_lost_stop_can_authorize_get(self):
        for failure in ('os-error', 'serialization'):
            with self.subTest(failure=failure):
                instance = self.fixture()
                at = 1900000000
                instance.secret, instance.officer = 'synthetic-secret', 'Fern Melder'
                instance._custody_halted, instance._ack_settlement_pending = False, None
                instance.state = watcher.State(instance.sv_file.with_suffix('.state'))
                instance.state.save()
                control = dict(version=1, action='stop', id=str(at)+':2', observedAt=at,
                               scopeHash=page(at)['scopeHash'], guid='Player-1-0000AAAA', offset=0)
                control['mac'] = launch.control_mac(instance.secret, control)
                db = dict(lastCharacterGuid=control['guid'], launchControl=control,
                          roster=dict(exportedAt=at-10, nativeGuild='OLYMPUS PRIME', nativeRealm='Native Realm',
                                      members=[dict(name='Fern Melder', guid=control['guid'])]))
                instance.sv_file.write_text('OlympusVerifyDB = '+launch._lua(db))
                instance.valid_launch_control = watcher.Watcher.valid_launch_control.__get__(instance)
                instance.read_launch_control = watcher.Watcher.read_launch_control.__get__(instance)
                instance.launch_scan = launch.Scan(lambda: at)
                instance.launch_scan.request(dict(action='scan', id='prior-control', scopeHash=control['scopeHash']), at)
                instance.launch_scan.step(lambda *args, **kwargs: (True, page(at, total=40)), at)
                calls = []
                instance.worker = SimpleNamespace(call=lambda *args, **kwargs: calls.append(1), paused=lambda: None)
                if failure == 'serialization': instance.state.d['unserializable-test-value'] = {1}
                with patch.object(watcher.time, 'time', return_value=at):
                    with patch.object(watcher, 'atomic_local_text', side_effect=OSError('synthetic private write error')) if failure == 'os-error' else patch.object(watcher, 'log'):
                        with self.assertRaises(watcher.CustodyStopped) as stopped:
                            self.read(instance)
                    self.assertEqual(str(stopped.exception), 'launch control reservation custody stopped; inspect storage and restart')
                    self.assertTrue(stopped.exception.__suppress_context__)
                    self.assertTrue(instance._custody_halted)
                    self.assertIsNone(instance._launch_consumed_sv_witness)
                    self.assertTrue(instance.state.was_seen('launch-control:'+control['guid']+':'+control['id']))
                    self.assertEqual(instance.launch_scan.phase, 'discover')
                    instance.state.d.pop('unserializable-test-value', None)
                    # Even a later successful normal intake cannot reclassify
                    # the uncommitted in-memory claim as launch authority.
                    self.read(instance)
                    self.assertIsNone(instance._launch_consumed_sv_witness)
                    instance.pull_launch_operations()
                    self.assertEqual(calls, [])
    def test_changed_during_control_or_save_never_labels_new_bytes_consumed(self):
        for phase in ('control', 'save'):
            with self.subTest(phase=phase):
                instance = self.fixture()
                def change(*args): instance.sv_file.write_text('OlympusVerifyDB = { events = {}, changed = true }')
                if phase == 'control': instance.read_launch_control = change
                else: instance.state.save = change
                self.read(instance)
                self.assertIsNone(instance._launch_consumed_sv_witness)

    def test_missing_parse_failure_replacement_and_unknown_identity_clear_witness(self):
        for mode in ('missing', 'parse', 'replaced', 'zero-inode'):
            with self.subTest(mode=mode):
                instance = self.fixture(); self.read(instance)
                self.assertIsNotNone(instance._launch_consumed_sv_witness)
                if mode == 'missing': instance.sv_file.unlink()
                elif mode == 'parse':
                    instance.sv_file.write_text('invalid syntax {'); instance.state.d['sv_mtime'] = 0
                elif mode == 'replaced':
                    before = instance.sv_file.stat(); other = instance.sv_file.with_suffix('.new')
                    other.write_bytes(instance.sv_file.read_bytes()); os.utime(other, ns=(before.st_atime_ns, before.st_mtime_ns)); os.replace(other, instance.sv_file)
                else:
                    actual = instance.sv_file.lstat()
                    bad = SimpleNamespace(**{name: getattr(actual, name) for name in ('st_mode', 'st_dev', 'st_mtime_ns', 'st_ctime_ns', 'st_size')}, st_ino=0)
                    with patch.object(Path, 'lstat', return_value=bad), self.assertRaises(watcher.SavedVariablesSourceUnavailable):
                        self.read(instance)
                    self.assertIsNone(instance._launch_consumed_sv_witness); continue
                with patch.object(watcher, 'log'):
                    if mode in ('missing','parse'):
                        with self.assertRaises(watcher.SavedVariablesSourceUnavailable): self.read(instance)
                    else:
                        self.read(instance)
                self.assertIsNone(instance._launch_consumed_sv_witness)


if __name__ == '__main__':
    unittest.main()

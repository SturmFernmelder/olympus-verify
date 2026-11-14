"""Explicit sparse selected batches through the actual selected state machine."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import test_launch_selected as single
import launch_operations229 as launch
import savedvars
import watcher


class SelectedBatch276(unittest.TestCase):
    def setUp(self):
        self.f = single.SelectedReads()
        self.f.setUp()
        f = self.f
        targets = [row['guid'] for row in f.roster['members'][2::2]][:17]
        f.control = {key: value for key, value in f.control.items() if key not in ('targetGuid', 'mac')}
        f.control.update(version=4, action='select-directive', targetGuids=targets)
        f.control['mac'] = launch.selected_control_mac('synthetic-secret', f.control)
        f.reply = self.reply
        f.selected.request(f.control, f.accepted, f.roster, f.clock)

    def reply(self, retry=None):
        f = self.f
        from test_launch_operations229 import page
        p = page(int(f.clock), 0, 40, f.at)
        p.update(snapshotAt=f.at, expiresAt=f.at+600, nextCursor=None,
                 pageCursor='opaque-private-v5-context', invites=[], riskBuffer=[])
        p['scan'].update(startedAt=f.at, expiresAt=f.at+600)
        p['entitlements'].update(scanned=len(f.control['targetGuids']),
                                 unscanned=40-len(f.control['targetGuids']), retryAfterSeconds=retry)
        p['promotions'] = [f.promotion(guid) for guid in f.control['targetGuids']]
        if retry is not None:
            p['heldReasons'].append('discord-rate-limited')
        return dict(version=2, protocol=launch.DIRECTIVE_PROTOCOL, coverageKind='selected-guids',
                    actorGuid=f.control['guid'],controlId=f.control['id'], targetGuids=list(f.control['targetGuids']),
                    targetsDigest=launch.targets_digest276(f.control['targetGuids']),
                    coveredGuids=list(f.control['targetGuids']), page=p)

    def test_sorted_unique_bounded_signed_control_and_single_separation(self):
        f = self.f
        args = ('synthetic-secret', f.control, f.at, f.control['guid'], 'OLYMPUS PRIME', 'Native Realm')
        self.assertTrue(launch.validate_selected_control(*args))
        self.assertFalse(launch.validate_control(*args))
        changes = [dict(version=2), dict(action='select'), dict(targetGuid=f.control['targetGuids'][0]),
                   dict(targetGuids=[]), dict(targetGuids=f.control['targetGuids'][::-1]),
                   dict(targetGuids=[f.control['targetGuids'][0]]*2),
                   dict(targetGuids=[row['guid'] for row in f.roster['members'][:21]]),
                   dict(targetGuids=['Player-1-0000FFFF']), dict(mac='0'*32)]
        for change in changes:
            with self.subTest(change=change):
                self.assertFalse(launch.validate_selected_control(args[0], {**f.control, **change}, *args[2:]))
        maximum = {**f.control, 'targetGuids': [row['guid'] for row in f.roster['members'][1:21]]}
        maximum['mac'] = launch.selected_control_mac(args[0], maximum)
        self.assertTrue(launch.validate_selected_control(args[0], maximum, *args[2:]))

    def test_sparse17_single_get_exact_coverage_original_clocks_and_literal_roundtrip(self):
        f = self.f
        self.assertTrue(f.tick(f.call()))
        r = f.selected.record
        self.assertEqual((r['attempts'], r['completed'], r['running']), (1, True, False))
        self.assertEqual(r['coveredGuids'], f.control['targetGuids'])
        self.assertEqual(r['page']['entitlements'], dict(offset=0, pageSize=20, scanned=17, total=40, unscanned=23, retryAfterSeconds=None))
        self.assertEqual(json.loads(f.calls[0]['targetGuids'][0]), f.control['targetGuids'])
        self.assertNotIn('targetGuid', f.calls[0]); self.assertNotIn('cursor', f.calls[0])
        original = copy.deepcopy(r)
        body = launch.render_selected(r, f.at+300)
        output = savedvars.parse(body)['OlympusLaunchSelected']
        self.assertEqual(output['targetsDigest'], launch.targets_digest276(f.control['targetGuids']))
        self.assertNotIn('targetGuid', output); self.assertNotIn('pageCursor', output['page'])
        self.assertNotIn('opaque-private-v5-context', body)
        changed = copy.deepcopy(f.roster); changed['exportedAt'] += 30
        self.assertFalse(f.selected.source_changed(changed)); self.assertEqual(r, original)
        self.assertFalse(launch._selected_page(r['page'], r, r['coveredGuids'], f.at+600))

    def test_batch_wrapper_exactness_scope_coverage_counts_and_no_other_authority(self):
        f = self.f
        changes = [lambda r: r.update(protocol=launch.SELECTED_PROTOCOL),
                   lambda r: r.update(targetGuid=f.control['targetGuids'][0]),
                   lambda r: r.update(coverageKind='native-page'),
                   lambda r: r.update(targetsDigest='0'*64),
                   lambda r: r['targetGuids'].reverse(), lambda r: r['coveredGuids'].reverse(),
                   lambda r: r['coveredGuids'].pop(), lambda r: r['page']['entitlements'].update(offset=20),
                   lambda r: r['page']['entitlements'].update(scanned=20),
                   lambda r: r['page'].update(memberCount=41), lambda r: r['page'].update(snapshotId=13),
                   lambda r: r['page']['scan'].update(startedAt=f.at+1),
                   lambda r: r['page'].update(nextCursor='forbidden'), lambda r: r['page'].update(invites=[{}]),
                   lambda r: r['page'].update(riskBuffer=[{}]),
                   lambda r: r['page']['promotions'][0].update(guid='Player-1-0000FFFF')]
        for mutate in changes:
            with self.subTest(mutate=mutate):
                f.clock = float(f.at); f.selected = launch.SelectedRead(lambda: f.clock)
                f.selected.request(f.control, f.accepted, f.roster, f.clock)
                value = self.reply(); mutate(value)
                f.tick(f.call((True, value)))
                self.assertEqual((f.selected.record['completed'], f.selected.record['page']), (False, None))
                self.assertEqual(f.selected.record['stoppedReason'], 'invalid-selected-page')

    def test_known429_three_attempts_exact_targets_no_renewal_and_no_unknown_retry(self):
        f = self.f
        f.tick(f.call((False, dict(httpStatus=429, retryAfterSeconds=5))))
        self.assertEqual(f.selected.next_at, f.clock+5)
        f.tick(f.call(lambda: (True, self.reply(retry=5))))
        self.assertEqual(f.selected.record['attempts'], 2)
        f.tick(f.call())
        self.assertTrue(f.selected.record['completed']); self.assertEqual(len(f.calls), 3)
        self.assertNotIn('cursor', f.calls[0]); self.assertNotIn('cursor', f.calls[1])
        self.assertEqual(f.calls[2]['cursor'], ['opaque-private-v5-context'])
        for query in f.calls:
            self.assertEqual(json.loads(query['targetGuids'][0]), f.control['targetGuids'])
            self.assertEqual(query['selectionId'], [f.control['id']])
            self.assertEqual(query['snapshotAt'], [str(f.at)])
        self.assertEqual(f.selected.record['expiresAt'], f.at+600)
        for response in ((False, 'unknown'), (False, dict(httpStatus=409)), (False, dict(httpStatus=403))):
            f.clock = float(f.at); f.selected.request(f.control, f.accepted, f.roster, f.clock)
            before = len(f.calls); f.tick(f.call(response)); f.clock += 5
            self.assertFalse(f.tick(f.call())); self.assertEqual(len(f.calls), before+1)

    def test_missing_target_duplicate_native_and_initial_expiry_cannot_bootstrap(self):
        f = self.f
        missing = copy.deepcopy(f.control); missing['targetGuids'][-1] = 'Player-1-0000FFFF'
        f.selected.request(missing, f.accepted, f.roster, f.clock)
        self.assertEqual(f.selected.record['stoppedReason'], 'selected-target-unavailable')
        duplicate = copy.deepcopy(f.roster); duplicate['members'][-1]['guid'] = duplicate['members'][2]['guid']
        f.selected.request(f.control, f.accepted, duplicate, f.clock)
        self.assertFalse(f.selected.running); self.assertEqual(f.selected.record['attempts'], 0)
        f.selected.request(f.control, f.accepted, f.roster, f.at)
        f.clock = f.at+60; f.tick(f.call()); self.assertEqual(f.calls, [])
        self.assertEqual(f.selected.record['stoppedReason'], 'selection-admission-expired')

    def test_actual_batch_intake_ack_witness_and_reload_preserve_discovery(self):
        f = self.f
        with tempfile.TemporaryDirectory() as temporary:
            w, db, original = f.watcher(Path(temporary))
            with patch.object(watcher.time, 'time', lambda: f.clock), patch.object(watcher.time, 'sleep'):
                w.check_savedvars(); self.assertIsNotNone(w._launch_consumed_sv_witness)
                w.pull_launch_operations(); self.assertTrue(w.launch_selected.record['completed'])
                self.assertEqual(w.launch_operations_file.read_bytes(), original)
                output = savedvars.parse_file(w.launch_selected_file)['OlympusLaunchSelected']
                self.assertEqual(output['targetGuids'], f.control['targetGuids'])
                selected = w.launch_selected_file.read_bytes()
                f.clock += 120; db['roster']['exportedAt'] = int(f.clock)
                w.sv_file.write_text('OlympusVerifyDB='+launch._lua(db), encoding='utf-8'); w.state.d['sv_mtime'] = 0
                w.check_savedvars(); w.pull_launch_operations()
                self.assertEqual(w.launch_selected_file.read_bytes(), selected)
                self.assertEqual(w.launch_operations_file.read_bytes(), original); self.assertEqual(len(f.calls), 1)

    def test_actual_batch_pause_witness_and_changed_file_cannot_dispatch(self):
        for guard in ('pause', 'missing-witness', 'changed-file'):
            with self.subTest(guard=guard), tempfile.TemporaryDirectory() as temporary:
                self.setUp(); f = self.f; w, db, original = f.watcher(Path(temporary))
                with patch.object(watcher.time, 'time', lambda: f.clock), patch.object(watcher.time, 'sleep'):
                    w.check_savedvars()
                    if guard == 'pause':
                        w.worker.paused = lambda: 'synthetic-pause'
                    elif guard == 'missing-witness':
                        w._launch_consumed_sv_witness = None
                    else:
                        w.sv_file.write_text('OlympusVerifyDB={}', encoding='utf-8')
                    w.pull_launch_operations()
                    self.assertEqual(f.calls, []); self.assertEqual(w.launch_selected.record['attempts'], 0)
                    self.assertEqual(w.launch_operations_file.read_bytes(), original)

    def test_actual_batch_stop_and_source_change_never_restart_old_discovery(self):
        for guard in ('stop', 'source-change'):
            with self.subTest(guard=guard), tempfile.TemporaryDirectory() as temporary:
                self.setUp(); f = self.f; w, db, original = f.watcher(Path(temporary))
                normal = w.worker.call
                def transport(method, path, body=None, retries=3):
                    return normal(method, path, body, retries) if method == 'POST' else f.call(lambda: (True, self.reply(retry=5)))(method, path, retries)
                w.worker.call = transport
                with patch.object(watcher.time, 'time', lambda: f.clock), patch.object(watcher.time, 'sleep'):
                    w.check_savedvars(); w.pull_launch_operations()
                    self.assertTrue(w.launch_selected.running); self.assertEqual(len(f.calls), 1)
                    if guard == 'stop':
                        stop = dict(version=1, action='stop', id=str(f.at)+':9', observedAt=f.at,
                                    scopeHash=f.control['scopeHash'], guid=f.control['guid'], offset=0)
                        stop['mac'] = launch.control_mac('synthetic-secret', stop)
                        db['launchControl'] = stop
                    else:
                        db['roster']['members'][2]['rankIndex'] = 8
                    f.clock += 1; db['roster']['exportedAt'] = int(f.clock)
                    w.sv_file.write_text('OlympusVerifyDB='+launch._lua(db), encoding='utf-8'); w.state.d['sv_mtime'] = 0
                    w.check_savedvars(); f.clock += 10; w.pull_launch_operations()
                    self.assertFalse(w.launch_selected.running); self.assertEqual(len(f.calls), 1)
                    if guard == 'stop':
                        self.assertEqual(w.launch_scan.phase, 'idle')
                        self.assertEqual(w.launch_scan.stopped, 'operator-stopped')
                        self.assertEqual(w.launch_scan.pages, {})
                        self.assertEqual(w.launch_scan.calls, 0)
                    else:
                        self.assertEqual(w.launch_operations_file.read_bytes(), original)

    def test_during_transport_file_change_and_native_deadline_cannot_complete(self):
        for guard in ('file-change', 'expiry'):
            with self.subTest(guard=guard), tempfile.TemporaryDirectory() as temporary:
                self.setUp(); f = self.f; w, db, original = f.watcher(Path(temporary)); normal = w.worker.call
                def transport(method, path, body=None, retries=3):
                    if method == 'POST':
                        return normal(method, path, body, retries)
                    result = f.call()(method, path, retries)
                    if guard == 'file-change':
                        w.sv_file.write_text('OlympusVerifyDB={}', encoding='utf-8')
                    else:
                        f.clock = f.at+600
                    return result
                w.worker.call = transport
                with patch.object(watcher.time, 'time', lambda: f.clock), patch.object(watcher.time, 'sleep'):
                    w.check_savedvars(); w.pull_launch_operations()
                    self.assertFalse(w.launch_selected.record['completed']); self.assertEqual(len(f.calls), 1)
                    self.assertEqual(w.launch_operations_file.read_bytes(), original)

    def test_actual_batch_refused_or_same_second_upload_cannot_borrow_old_ack(self):
        for outcome in ('same-second', 'refused'):
            with self.subTest(outcome=outcome), tempfile.TemporaryDirectory() as temporary:
                self.setUp(); f = self.f; w, db, original = f.watcher(Path(temporary))
                w._launch_accepted_roster = copy.deepcopy(f.accepted)
                if outcome == 'same-second':
                    import hashlib
                    w.state.d['roster_sent'] = f.at
                    scope = {key: f.roster[key] for key in ('nativeGuild', 'nativeRealm', 'nativeRankTable')}
                    w.state.d['roster_scope_hash'] = hashlib.sha256(json.dumps(scope, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
                else:
                    w.worker.call = lambda *args, **kwargs: (False, 'unknown')
                with patch.object(watcher.time, 'time', lambda: f.clock), patch.object(watcher.time, 'sleep'):
                    w.check_savedvars(); w.pull_launch_operations()
                    self.assertFalse(w.launch_selected.running); self.assertFalse(w.launch_selected.record['completed'])
                    self.assertEqual(w.launch_selected.record['attempts'], 0)
                    self.assertIsNone(w.launch_selected.record['snapshotId'])
                    self.assertEqual(w.launch_operations_file.read_bytes(), original); self.assertEqual(f.calls, [])


if __name__ == '__main__':
    unittest.main()

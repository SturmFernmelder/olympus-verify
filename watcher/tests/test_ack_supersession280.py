"""Actual Watcher/SV/custody regressions; synthetic HTTP, no provider."""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

output = None
if __name__ == '__main__' and ('--source' in sys.argv or '--out' in sys.argv):
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    source = Path(args.source).resolve()
    output = Path(args.out)
    os.environ['WATCHER_TEST_SOURCE'] = str(source)
else:
    source = Path(os.environ.get('WATCHER_TEST_SOURCE', str(Path(__file__).resolve().parents[1]))).resolve()
sys.path.insert(0, str(source))
sys.path.insert(0, str(source / 'tests'))
import watcher
from native_rank_schemes import NAMES
import test_verification_source_witness280 as source_fixture
GUID = source_fixture.GUID

records = []

def original_fields(item):
    return copy.deepcopy({key: item[key] for key in ('path', 'body', 'at', 'binding', 'custody', 'digest')})

class AckSupersession280(unittest.TestCase):
    def setUp(self):
        self.h = source_fixture.VerificationSourceWitness280Tests('test_known_ack_same_source_stays_ready_and_actual_whisper_posts_once')
        self.h.setUp()
        self.addCleanup(self.h.doCleanups)
        self.w = self.h.w
        self.h.db['roster']['nativeRankTable'] = {'version':1, 'names':list(NAMES)}
        self.calls = []
        self.roster_calls = 0
        self.first_unknown = True
        self.unknown_verify = False
        self.trace = {'test':self.id(), 'events':[]}
        self.addCleanup(lambda: records.append(copy.deepcopy(self.trace)))
        self.w.worker.call = self.transport
        self.originals = []
        freeze = self.w._freeze_original
        def observe_freeze(*a, **kw):
            original = freeze(*a, **kw)
            self.originals.append(original)
            return original
        self.w._freeze_original = observe_freeze

    def transport(self, method, path, body=None, retries=3):
        self.calls.append((method, path, copy.deepcopy(body), retries))
        if path == '/ingest/roster':
            self.roster_calls += 1
            self.trace['events'].append({'kind':'roster-transport', 'exportedAt':body['exportedAt'], 'rosterCall':self.roster_calls})
            if self.roster_calls == 1 and self.first_unknown:
                return False, 'synthetic unknown reply'
            return True, {'trusted':True, 'snapshot':8 if self.roster_calls == 2 else 7, 'members':len(body['members'])}
        if path == '/ingest/verify':
            return (False, 'synthetic unknown verify') if self.unknown_verify else (True, {'result':'member','pendingConsumed':True})
        raise AssertionError('Unexpected synthetic path '+path)

    def prepare_b(self, kind='rank'):
        self.h.write()
        self.w.check_savedvars()
        self.assertFalse(self.w.verification_roster_ready(self.h.body()))
        self.a = self.w.state.d['outbox'][0]
        self.a_frozen = original_fields(self.a)
        if kind != 'equal-time':
            self.h.at += 1
        self.h.db['roster']['exportedAt'] = self.h.at
        if kind != 'timestamp':
            self.h.db['roster']['members'][1].update(rank='Alt', rankIndex=8)
        self.h.write()
        self.w.check_savedvars()
        self.assertEqual(self.roster_calls, 2)
        self.assertTrue(self.w.verification_roster_ready(self.h.body()))
        self.b = self.w._verification_roster
        self.b_frozen = copy.deepcopy(self.b)
        self.trace['bInstalled'] = {'exportedAt':self.b['exportedAt'], 'snapshot':self.b['snapshot']}

    def late_a(self):
        self.w.flush_outbox()
        self.assertEqual(self.roster_calls, 3)
        self.assertEqual(original_fields(self.a), self.a_frozen)
        self.trace['afterLateA'] = None if self.w._verification_roster is None else {'exportedAt':self.w._verification_roster['exportedAt'], 'snapshot':self.w._verification_roster['snapshot']}

    def assert_b_preserved(self):
        ready = self.w.verification_roster_ready(self.h.body())
        self.trace['readyAfterLateA'] = ready
        self.assertTrue(ready, 'late original A must not discard or replace known current B')
        self.assertIs(self.w._verification_roster, self.b)
        self.assertEqual(self.w._verification_roster, self.b_frozen, 'no new ACK clock/snapshot/source proof')
        self.w.check_savedvars()
        self.assertEqual(self.roster_calls, 3, 'identical B must not be resent to repair late A')
        self.assertTrue(self.w.verification_roster_ready(self.h.body()))

    def test_changed_b_known_ack_survives_late_a_and_whisper_posts_once(self):
        self.prepare_b()
        self.late_a()
        self.assert_b_preserved()
        self.w.handle_chat_line(self.h.line())
        self.w.handle_chat_line(self.h.line())
        self.assertEqual(sum(path=='/ingest/verify' for _,path,_,_ in self.calls),1)

    def test_timestamp_only_new_known_b_ack_is_not_downgraded_by_a(self):
        self.prepare_b('timestamp')
        self.late_a()
        self.assert_b_preserved()

    def test_same_second_changed_b_known_ack_survives_late_a(self):
        self.prepare_b('equal-time')
        self.late_a()
        self.assert_b_preserved()

    def test_current_c_change_still_holds_installed_b_and_late_a(self):
        self.prepare_b()
        self.h.db['roster']['members'][1]['guid'] = 'Player-1-ABCDEF13'
        self.h.write(restore_stamp=True)
        self.late_a()
        self.assertFalse(self.w.verification_roster_ready(self.h.body()))
        self.assertIsNone(self.w._verification_roster)
        with self.assertRaises(watcher.VerificationDeferred):
            self.w.handle_chat_line(self.h.line())
        self.assertFalse(any(path=='/ingest/verify' for _,path,_,_ in self.calls))

    def test_unknown_attempted_verify_original_is_not_retried_or_reclocked(self):
        self.prepare_b()
        self.unknown_verify = True
        self.w.handle_chat_line(self.h.line())
        unknown = next(item for item in self.w.state.d['outbox'] if item['path']=='/ingest/verify')
        frozen = original_fields(unknown)
        self.late_a()
        self.assert_b_preserved()
        self.assertEqual(original_fields(unknown), frozen)
        self.assertIn(unknown, self.w.state.d['outbox'])
        self.assertEqual(sum(path=='/ingest/verify' for _,path,_,_ in self.calls),1)

    def test_other_unique_member_guid_cannot_substitute_for_configured_officer(self):
        self.first_unknown = False
        self.h.db['lastCharacterGuid'] = GUID
        self.h.write()
        self.w.check_savedvars()
        self.assertEqual(self.roster_calls, 1)
        self.assertFalse(self.w.verification_roster_ready(self.h.body()))
        self.assertIsNone(self.w._verification_roster)

    def test_equal_original_duplicate_callback_never_replaces_known_b(self):
        self.prepare_b()
        original_b = next(item for item in self.originals if item['path']=='/ingest/roster' and item is not self.a)
        frozen = original_fields(original_b)
        before = len(self.calls)
        self.w.note_verification_roster_receipt(original_b, {'trusted':True,'snapshot':8,'members':2})
        self.assertIs(self.w._verification_roster, self.b)
        self.assertEqual(self.w._verification_roster, self.b_frozen)
        self.assertEqual(original_fields(original_b), frozen)
        self.assertEqual(len(self.calls), before)

    def test_source_changes_between_incoming_and_installed_validation_still_holds(self):
        self.prepare_b('timestamp')
        # Observe a genuine read, then emulate the independent client replacing
        # its content. Returned source bytes remain the actual captured snapshot.
        read = watcher.savedvars_source280.read
        reads = 0
        def read_then_change(*a, **kw):
            nonlocal reads
            snapshot = read(*a, **kw)
            reads += 1
            if reads == 1:
                self.h.db['roster']['members'][1]['guid'] = 'Player-1-ABCDEF13'
                self.h.write(restore_stamp=True)
            return snapshot
        with patch.object(watcher.savedvars_source280, 'read', side_effect=read_then_change):
            self.late_a()
        self.assertGreaterEqual(reads,1)
        self.assertIsNot(self.w._verification_roster, self.b, 'a changed source cannot preserve the installed B witness')
        self.assertFalse(self.w.verification_roster_ready(self.h.body()))
        self.assertIsNone(self.w._verification_roster)
        with self.assertRaises(watcher.VerificationDeferred):
            self.w.handle_chat_line(self.h.line())
        self.assertFalse(any(path=='/ingest/verify' for _,path,_,_ in self.calls))

if __name__=='__main__':
    if output is None:
        unittest.main(verbosity=2)
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(AckSupersession280)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    output.write_text(json.dumps({'source':str(source), 'watcherSHA256':hashlib.sha256((source/'watcher.py').read_bytes()).hexdigest(), 'tests':result.testsRun, 'failures':len(result.failures),'errors':len(result.errors),'successful':result.wasSuccessful(),'records':records},indent=2)+'\n','utf-8')
    raise SystemExit(0 if result.wasSuccessful() else 1)

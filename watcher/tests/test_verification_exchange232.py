"""Actual collector paths over synthetic native files and HTTP; no client/config/network."""
from pathlib import Path
from datetime import datetime, timezone
import copy
import contextlib
import hashlib
import hmac
import io
import json
import os
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.response
import uuid
from unittest.mock import patch

sys.path.insert(0, os.environ.get('WATCHER_TEST_SOURCE', str(Path(__file__).resolve().parents[1])))
import watcher
import codes
import officer_invites233
from custody_recovery import StateLease
from native_membership227 import membership_mac

SECRET = 'synthetic-exchange-only'
NAME = 'Fresh Member'
GUID = 'Player-1-ABCDEF12'
GUILD = 'OLYMPUS PRIME'
REALM = 'Synthetic Native Realm'


def lua(value):
    if value is None:
        return 'nil'
    if isinstance(value, dict):
        return '{' + ','.join('[' + json.dumps(k) + ']=' + lua(v) for k, v in value.items()) + '}'
    if isinstance(value, list):
        return '{' + ','.join(lua(v) for v in value) + '}'
    return json.dumps(value)


class VerificationExchangeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.at = int(time.time())
        self.clock = patch.object(watcher.time, 'time', return_value=self.at)
        self.now = self.clock.start()
        self.cfg = dict(wow_dir=str(self.root), account='SYNTHETIC', worker_url='https://test.invalid',
                        watcher_token='synthetic-token', verify_secret=SECRET, officer_character='Fern Melder',
                        membership_only=True, state_file=str(self.root / 'state.json'))
        self.w = watcher.Watcher(self.cfg)
        self.code = codes.code_for(SECRET, NAME, codes.day_bucket(datetime.now(timezone.utc)))
        self.calls = []
        self.accepted = False
        self.w.worker.call = self.transport

    def tearDown(self):
        self.clock.stop()
        self.tmp.cleanup()

    def transport(self, method, path, body=None, retries=3):
        self.calls.append((method, path, copy.deepcopy(body), retries))
        if path == '/health':
            return True, {'ok': True, 'verification': {'mode': 'members-only', 'nativeScopePinned': True, 'nativeMembershipProofVersion': 1, 'nativeRosterProtocolVersion': 2}}
        if path == '/ingest/roster':
            self.accepted = True
            return True, {'snapshot': 7, 'trusted': True, 'members': len(body['members'])}
        if path == '/ingest/verify':
            if body.get('ts', self.at) <= self.at - 600:
                return True, dict(result='source_expired', pendingConsumed=False, roleGranted=False, inviteQueued=False)
            return True, {'result': 'member' if self.accepted else 'membership_not_confirmed',
                          'roleOutcome': 'granted' if self.accepted else 'held', 'roleGranted': self.accepted,
                          'pendingConsumed': True}
        return True, {'result': 'ok'}

    def roster(self, at=None):
        return dict(exportedAt=self.at if at is None else at, total=2, nativeGuild=GUILD, nativeRealm=REALM,
                    members=[dict(name='Fern Melder', guid='Player-1-00000001', rank='Guild Master', rankIndex=0, level=60),
                             dict(name=NAME, guid=GUID, rank='Member', rankIndex=7, level=60)])

    def proof(self):
        p = dict(version=1, member=True, observedAt=self.at,
                 scopeHash=hashlib.sha256(('native-scope|1|' + GUILD + '|' + REALM).encode()).hexdigest()[:16])
        p['mac'] = membership_mac(SECRET, NAME, GUID, self.code, p)
        return p

    def body(self):
        return dict(character=NAME, guid=GUID, code=self.code, source='whisper', ts=self.at,
                    officer='Fern Melder', nativeMembership=self.proof())

    def line(self):
        p = self.proof()
        return f"11/6 01:00:00.000  To Fern Melder: Olympus: member {NAME} {GUID} {self.code} 1 {p['observedAt']} {p['scopeHash']} (ref OLVm-{p['mac']})"

    def save_native(self, roster=None):
        db = dict(roster=roster or self.roster(), lastCharacterGuid='Player-1-00000001',
                  events=[dict(type='whisper', name=NAME, guid=GUID, code=self.code, ok=True, ts=self.at, nativeMembership=self.proof())])
        self.w.sv_file.parent.mkdir(parents=True, exist_ok=True)
        self.w.sv_file.write_text('OlympusVerifyDB = ' + lua(db), encoding='utf-8')

    def read_native_roster(self, roster=None):
        db = dict(roster=self.roster() if roster is None else roster, lastCharacterGuid='Player-1-00000001', events=[])
        self.w.sv_file.parent.mkdir(parents=True, exist_ok=True)
        self.w.sv_file.write_text('OlympusVerifyDB = ' + lua(db), encoding='utf-8')
        self.w.check_savedvars()

    def admit(self):
        self.read_native_roster()
        self.assertTrue(self.w.verification_roster_ready(self.body()))
        self.calls.clear()

    def test_savedvariables_admits_roster_before_verification(self):
        # The shipped collector actually sends verify first. This is the fail-before oracle.
        self.w.state.d['roster_sent'] = self.at - 1012
        self.save_native()
        with patch.object(watcher.time, 'sleep'):
            self.w.check_savedvars()
        paths = [c[1] for c in self.calls if c[1] in ('/ingest/roster', '/ingest/verify')]
        self.assertEqual(paths, ['/ingest/roster', '/ingest/verify'])
        self.assertEqual(len([c for c in self.calls if c[1] == '/ingest/verify']), 1)

    def test_legacy_source_order_is_unchanged(self):
        self.w.membership_only = self.w.worker.membership_only = False
        self.save_native()
        with patch.object(watcher.time, 'sleep'):
            self.w.check_savedvars()
        self.assertEqual([c[1] for c in self.calls if c[0] == 'POST'], ['/ingest/verify', '/ingest/roster'])

    def test_missing_ack_defers_without_seen_claim_or_reserved_body(self):
        with self.assertRaises(watcher.VerificationDeferred):
            self.w.handle_chat_line(self.line())
        self.assertFalse(self.w.state.was_seen(self.w.code_key('w', NAME, self.code)))
        self.assertEqual((self.calls, self.w.state.d['outbox']), ([], []))

    def test_actual_ack_allows_exact_proof_once_across_chat_and_saved_events(self):
        self.admit()
        self.w.handle_chat_line(self.line())
        self.w.handle_chat_line(self.line())
        self.w.forward_events([dict(type='whisper', name=NAME, guid=GUID, code=self.code, ok=True, ts=self.at, nativeMembership=self.proof())])
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.calls[0][2]['nativeMembership'], self.proof())
        self.assertEqual(self.calls[0][3], 1)

    def test_chat_cursor_retained_until_roster_then_actual_line_dispatches(self):
        self.w.chat_log.parent.mkdir(parents=True, exist_ok=True)
        self.w.chat_log.write_text(self.line() + '\n', encoding='utf-8')
        self.w.state.d['chat_init'] = True
        self.w.tail_chat_log()
        self.assertEqual(self.w.state.d['chat_offset'], 0)
        self.assertEqual(self.calls, [])
        self.admit()
        self.w.tail_chat_log()
        self.assertEqual(len(self.calls), 1)
        self.assertGreater(self.w.state.d['chat_offset'], 0)

    def test_actual_run_stages_native_before_old_outbox_and_chat(self):
        self.save_native()
        self.w.chat_log.parent.mkdir(parents=True, exist_ok=True)
        self.w.chat_log.write_text(self.line() + '\n', encoding='utf-8')
        self.w.state.d['chat_init'] = True
        with patch.object(watcher.time, 'sleep'), patch.object(self.w, 'pull_queue', side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):
                self.w.run()
        self.assertEqual([c[1] for c in self.calls if c[0] == 'POST'], ['/ingest/roster', '/ingest/verify'])

    def test_unknown_roster_ack_keeps_source_and_late_original_ack_unblocks(self):
        self.save_native()
        original = self.transport
        self.w.worker.call = lambda method, path, body=None, retries=3: (self.calls.append((method, path, body, retries)) or (False, 'unknown'))
        with patch.object(watcher.time, 'sleep'):
            self.w.check_savedvars()
        self.assertEqual([c[1] for c in self.calls], ['/ingest/roster'])
        self.assertEqual(self.w.state.d['sv_mtime'], 0)
        self.assertFalse(self.w.state.was_seen(self.w.code_key('w', NAME, self.code)))
        self.w.worker.call = original
        self.w.flush_outbox()
        with patch.object(watcher.time, 'sleep'):
            self.w.check_savedvars()
        self.assertEqual(len([c for c in self.calls if c[1] == '/ingest/verify']), 1)

    def test_refused_or_untrusted_roster_never_admits_verification(self):
        for receipt in ({'trusted': False, 'snapshot': 7, 'members': 2},
                        {'trusted': True, 'snapshot': 7, 'members': 2, 'skipped': True},
                        {'trusted': True, 'snapshot': 7, 'members': 1},
                        {'trusted': True, 'snapshot': True, 'members': 2}):
            with self.subTest(receipt=receipt):
                self.w.state.d['roster_sent'] = 0
                self.w.worker.call = lambda *a, **k: (True, receipt)
                self.w.forward_roster(self.roster())
                self.assertFalse(self.w.verification_roster_ready(self.body()))

    def test_attempted_unknown_verify_never_automatically_resends(self):
        self.admit()
        self.w.worker.call = lambda *a, **k: (self.calls.append((a, k)) or (False, 'unknown'))
        self.w.handle_chat_line(self.line())
        original = copy.deepcopy(self.w.state.d['outbox'])
        self.w.flush_outbox()
        self.w.flush_outbox()
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.w.state.d['outbox'], original)

    def test_rehydrated_legacy_verify_row_cannot_gain_dispatch_authority(self):
        self.admit()
        item = self.w._freeze_original('/ingest/verify', self.body(), 'synthetic')
        retained = json.loads(json.dumps(item))
        self.w.state.d['outbox'].append(retained)
        self.w.flush_outbox()
        self.assertEqual(self.calls, [])
        self.assertEqual(self.w.state.d['outbox'], [retained])

    def test_new_source_same_second_change_immediately_holds_without_timestamp_invention(self):
        self.admit()
        changed = self.roster()
        changed['members'][1]['rankIndex'] = 8
        self.w.forward_roster(changed)
        self.assertEqual([c[1] for c in self.calls], ['/ingest/roster'])
        self.assertEqual(self.calls[0][2]['exportedAt'], self.at)
        self.assertFalse(self.w.verification_roster_ready(self.body()))
        with self.assertRaises(watcher.VerificationDeferred):
            self.w.handle_chat_line(self.line())

    def test_stale_ack_or_expired_proof_cannot_be_renewed_by_unchanged_export(self):
        self.admit()
        old_roster, old_body = self.roster(), self.body()
        self.at += 600
        self.now.return_value = self.at
        self.w.forward_roster(old_roster)
        self.assertFalse(self.w.verification_roster_ready(self.body()))
        self.assertEqual(self.calls, [])
        self.admit()
        self.assertFalse(self.w.verification_roster_ready(old_body))

    def test_identical_scan_coalescing_keeps_original_ack_deadline(self):
        self.save_native()
        with patch.object(watcher.time, 'sleep'):
            self.w.check_savedvars()
        self.calls.clear()
        self.w.launch_scan.pages[0] = dict(snapshotId=7, snapshotAt=self.at, guild=GUILD, realm=REALM, scan=dict(expiresAt=self.at + 600))
        self.w.launch_scan.stopped = None
        self.save_native(self.roster(self.at + 1))
        with patch.object(watcher.time, 'sleep'):
            self.w.check_savedvars()
        self.assertEqual(self.calls, [])
        self.assertTrue(self.w.verification_roster_ready(self.body()))
        self.assertEqual(self.w._verification_roster['exportedAt'], self.at)

    def test_original_roster_ack_local_save_failure_recovers_without_http(self):
        real_save = self.w.state.save
        failed = False
        def save():
            nonlocal failed
            if not self.w.state.d['outbox'] and not failed:
                failed = True
                raise OSError('synthetic local settlement failure')
            real_save()
        with patch.object(self.w.state, 'save', side_effect=save):
            self.read_native_roster()
        self.assertFalse(self.w.verification_roster_ready(self.body()))
        self.assertTrue(self.w.recover_local_settlement())
        self.assertEqual(len(self.calls), 1)
        self.assertTrue(self.w.verification_roster_ready(self.body()))

    def test_source_changed_during_parse_never_borrows_old_ack(self):
        self.save_native()
        original = watcher.savedvars.parse
        def parse(text):
            data = original(text)
            self.w.sv_file.write_text('-- concurrent incomplete export', encoding='utf-8')
            return data
        with patch.object(watcher.savedvars, 'parse', side_effect=parse), patch.object(watcher.time, 'sleep'):
            self.w.check_savedvars()
        # Capture custody may send that exact original roster. Changed current
        # bytes cannot turn its reply into current verification or control authority.
        self.assertEqual([c[1] for c in self.calls], ['/ingest/roster'])
        self.assertEqual(self.calls[0][2]['exportedAt'], self.at)
        self.assertEqual([m['guid'] for m in self.calls[0][2]['members']], ['Player-1-00000001', GUID])
        self.assertFalse(self.w.verification_roster_ready(self.body()))
        self.assertFalse(self.w.state.was_seen(self.w.code_key('w',NAME,self.code)))
        self.assertIsNone(self.w._launch_consumed_sv_witness)
        self.assertEqual(self.w.state.d['sv_mtime'], 0)

    def test_partial_source_invalidates_previous_positive(self):
        self.admit()
        partial = self.roster(self.at + 1)
        partial['total'] = 3
        self.w.forward_roster(partial)
        self.assertFalse(self.w.verification_roster_ready(self.body()))

    def test_file_changed_after_ack_holds_even_before_next_source_poll(self):
        self.save_native()
        with patch.object(watcher.time, 'sleep'):
            self.w.check_savedvars()
        self.calls.clear()
        self.w.sv_file.write_text('-- a new unfinished native export', encoding='utf-8')
        self.assertFalse(self.w.verification_roster_ready(self.body()))
        self.assertEqual(self.calls, [])

    def test_role_result_log_is_allowlisted_and_does_not_equate_member_with_role(self):
        self.assertIn('role=held', watcher.Worker.summarize(dict(result='member', roleOutcome='held', roleGranted=False, pendingConsumed=True, code=SECRET, guid=GUID)))
        self.assertNotIn(SECRET, watcher.Worker.summarize(dict(result='member', roleOutcome=SECRET)))
        self.assertNotIn(GUID, watcher.Worker.summarize(dict(result='member', roleOutcome='granted', guid=GUID)))
        self.assertEqual(watcher.Worker.summarize(dict(result='member', roleOutcome=[])), ' (member)')

    def test_existing_exclusive_pid_lease_remains_enforced(self):
        with StateLease(self.root / 'lease-state.json'):
            with self.assertRaises(FileExistsError):
                with StateLease(self.root / 'lease-state.json'):
                    self.fail('Second collector acquired the same state')

    def test_unrelated_offline_unknown_fields_do_not_block_known_unique_target(self):
        roster = self.roster()
        roster['members'].append(dict(name='Unknown Offline', guid=None, rank=None, rankIndex=None, level=None))
        roster['total'] = 3
        self.assertIsNone(watcher.launch_operations229.complete_roster_digest(roster))
        self.read_native_roster(roster)
        self.assertTrue(self.w.verification_roster_ready(self.body()))
        self.calls.clear()
        self.w.handle_chat_line(self.line())
        self.assertEqual([c[1] for c in self.calls], ['/ingest/verify'])

    def test_current_target_missing_guid_is_held_despite_trusted_complete_ack(self):
        roster = self.roster()
        roster['members'][1]['guid'] = None
        self.w.forward_roster(roster)
        self.assertFalse(self.w.verification_roster_ready(self.body()))

    def test_current_target_duplicate_guid_is_held_despite_trusted_complete_ack(self):
        roster = self.roster()
        roster['members'][0]['guid'] = GUID
        self.w.forward_roster(roster)
        self.assertFalse(self.w.verification_roster_ready(self.body()))

    def test_normalized_duplicate_name_never_qualifies_complete_source(self):
        roster = self.roster()
        roster['members'][0]['name'] = NAME + '-Realm'
        self.w.forward_roster(roster)
        self.assertFalse(self.w.verification_roster_ready(self.body()))

    def reserve_unattempted(self, preseen=False):
        self.admit()
        key = self.w.code_key('w', NAME, self.code)
        if preseen:
            self.w.state.seen(key)
        self.w.worker.call = lambda method, path, body=None, retries=3: (self.calls.append((method, path, copy.deepcopy(body), retries)) or (False, 'synthetic older outcome'))
        self.w.post('/ingest/events', {'events': []}, 'older synthetic event')
        self.older_original=self.w.state.d['outbox'][0]
        self.older_before=copy.deepcopy(self.older_original)
        # An explicit transport pause, rather than an unrelated FIFO head, keeps
        # this fixture genuinely unattempted under the independent626 contract.
        with patch.object(self.w.worker, 'paused', return_value='synthetic local pause'):
            self.w._post_claimed('/ingest/verify', self.body(), 'unattempted synthetic whisper', [key])
        item = self.w.state.d['outbox'][1]
        self.assertFalse(self.w._verification_originals[id(item)]['attempted'])
        self.calls.clear()
        self.w.worker.call = self.transport
        return item, key

    def expire_time(self):
        self.at += 601
        self.now.return_value = self.at

    def test_busy_before_first_flush_accepts_new_original_whisper_not_old_proof(self):
        old = dict(type='whisper', name=NAME, guid=GUID, code=self.code, ok=True,
                   ts=self.at, nativeMembership=self.proof())
        self.expire_time()
        fresh = dict(type='whisper', name=NAME, guid=GUID, code=self.code, ok=True,
                     ts=self.at, nativeMembership=self.proof())
        self.w.sv_file.parent.mkdir(parents=True, exist_ok=True)
        self.w.sv_file.write_text('OlympusVerifyDB = ' + lua(dict(roster=self.roster(),lastCharacterGuid='Player-1-00000001', events=[old, fresh])), encoding='utf-8')
        with patch.object(watcher.time, 'sleep'):
            self.w.check_savedvars()
        self.assertEqual([c[1] for c in self.calls], ['/ingest/roster', '/ingest/verify', '/ingest/verify'])
        self.assertEqual(self.calls[1][2]['nativeMembership'], old['nativeMembership'])
        self.assertEqual(self.calls[2][2]['nativeMembership'], fresh['nativeMembership'])
        self.assertNotEqual(self.calls[2][2]['nativeMembership'], old['nativeMembership'])

    def test_server_expired_receipt_releases_only_original_claim_then_fresh_proof_recovers(self):
        item, key = self.reserve_unattempted()
        old = copy.deepcopy(item)
        self.w.state.seen('unrelated-custody')
        self.expire_time()
        with patch.object(watcher, 'log') as messages:
            self.w.flush_outbox()
        self.assertEqual(item['body'], old['body'])
        self.assertEqual(item['digest'], old['digest'])
        self.assertTrue(item['acknowledged'])
        self.assertTrue(item['server_expired'])
        self.assertFalse(self.w.state.was_seen(key))
        self.assertTrue(self.w.state.was_seen('unrelated-custody'))
        self.assertEqual(self.w.state.d['outbox'], [self.older_original])
        self.assertEqual(self.older_original, self.older_before)
        self.assertIn('source_expired', ' '.join(c.args[0] for c in messages.call_args_list))
        self.assertEqual([c[2] for c in self.calls if c[1] == '/ingest/verify'], [old['body']])
        self.read_native_roster()
        self.w.forward_events([dict(type='whisper', name=NAME, guid=GUID, code=self.code, ok=True,
                                   ts=self.at, nativeMembership=self.proof())])
        posts = [c for c in self.calls if c[1] == '/ingest/verify']
        self.assertEqual(len(posts), 2)
        self.assertEqual(posts[1][2]['nativeMembership'], self.proof())
        self.assertNotEqual(posts[1][2]['nativeMembership'], old['body']['nativeMembership'])

    def test_expired_original_cannot_adopt_success_or_incomplete_no_effect_receipt(self):
        for receipt in (dict(result='member', roleGranted=True), dict(result='source_expired'),
                        dict(result='source_expired', pendingConsumed=False, roleGranted=True, inviteQueued=False)):
            with self.subTest(receipt=receipt):
                original_w, original_calls = self.w, self.calls
                original_at = self.at
                self.w = watcher.Watcher({**self.cfg, 'state_file': str(self.root / ('receipt-' + str(len(receipt)) + '.json'))})
                self.calls = []
                self.w.worker.call = self.transport
                try:
                    item, key = self.reserve_unattempted()
                    self.expire_time()
                    def response(method, path, body=None, retries=3):
                        self.calls.append((method, path, copy.deepcopy(body), retries))
                        return True, receipt if path == '/ingest/verify' else dict(result='ok')
                    self.w.worker.call = response
                    self.w.flush_outbox()
                    self.assertIs(self.w.state.d['outbox'][1], item)
                    self.assertTrue(self.w.state.was_seen(key))
                    self.assertNotIn('acknowledged', item)
                    before = len(self.calls);self.w.flush_outbox()
                    self.assertEqual(len(self.calls), before, 'Unknown attempted outcome never retries')
                finally:
                    self.w, self.calls = original_w, original_calls
                    self.at = original_at;self.now.return_value = self.at

    def test_expiry_never_overtakes_older_unknown_original(self):
        item, key = self.reserve_unattempted()
        prior = copy.deepcopy(self.w.state.d['outbox'][0])
        self.expire_time()
        self.w.worker.call = lambda *a, **k: (False, 'synthetic unknown')
        self.w.flush_outbox()
        self.assertEqual(self.w.state.d['outbox'][0], prior)
        self.assertIs(self.w.state.d['outbox'][1], item)
        self.assertTrue(self.w.state.was_seen(key))

    def test_unexpired_original_is_sent_once_without_replacing_its_proof(self):
        item, _ = self.reserve_unattempted()
        old = copy.deepcopy(item['body'])
        self.at += 599
        self.now.return_value = self.at
        self.w.flush_outbox()
        posts = [c for c in self.calls if c[1] == '/ingest/verify']
        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0][2], old)

    def test_expired_attempted_unknown_is_never_retired_or_retried(self):
        self.admit()
        self.w.worker.call = lambda *a, **k: (self.calls.append((a, k)) or (False, 'synthetic unknown'))
        self.w.handle_chat_line(self.line())
        item = self.w.state.d['outbox'][0]
        self.expire_time()
        self.w.flush_outbox()
        self.assertIs(self.w.state.d['outbox'][0], item)
        self.assertEqual(len(self.calls), 1)
        self.assertTrue(self.w.state.was_seen(self.w.code_key('w', NAME, self.code)))

    def test_expired_refused_original_is_never_retired(self):
        item, key = self.reserve_unattempted()
        item['refusal_status'] = 403
        self.expire_time()
        self.w.flush_outbox()
        self.assertIs(self.w.state.d['outbox'][1], item)
        self.assertTrue(self.w.state.was_seen(key))
        self.assertFalse(any(c[1] == '/ingest/verify' for c in self.calls))

    def test_expired_rehydrated_original_cannot_acquire_local_retirement_right(self):
        item, key = self.reserve_unattempted()
        restored = json.loads(json.dumps(item))
        self.w.state.d['outbox'][1] = restored
        self.expire_time()
        self.w.flush_outbox()
        self.assertIs(self.w.state.d['outbox'][1], restored)
        self.assertTrue(self.w.state.was_seen(key))

    def test_mutated_and_rehashed_body_is_not_the_private_original(self):
        item, key = self.reserve_unattempted()
        item['body']['ts'] += 1
        item['digest'] = self.w._original_digest(item)
        self.expire_time()
        self.w.flush_outbox()
        self.assertIs(self.w.state.d['outbox'][1], item)
        self.assertTrue(self.w.state.was_seen(key))

    def test_mutated_label_cannot_acquire_local_retirement_right(self):
        item, key = self.reserve_unattempted()
        item['label'] = 'changed diagnostic label'
        self.expire_time()
        self.w.flush_outbox()
        self.assertIs(self.w.state.d['outbox'][1], item)
        self.assertTrue(self.w.state.was_seen(key))

    def test_a_preexisting_seen_claim_is_never_owned_or_released_by_new_reservation(self):
        item, key = self.reserve_unattempted(preseen=True)
        self.expire_time()
        self.w.flush_outbox()
        self.assertIs(self.w.state.d['outbox'][1], item)
        self.assertTrue(self.w.state.was_seen(key))

        self.assertFalse(any(c[1] == '/ingest/verify' for c in self.calls), 'Unowned or duplicate claims never authorize HTTP')

    def test_different_claim_owner_blocks_expiry_even_for_identical_digest(self):
        item, key = self.reserve_unattempted()
        other = self.w._freeze_original('/ingest/verify', self.body(), 'different private original')
        self.w._verification_seen_claims[self.w.state._k(key)] = self.w._verification_originals[id(other)]
        self.expire_time()
        self.w.flush_outbox()
        self.assertIs(self.w.state.d['outbox'][1], item)
        self.assertTrue(self.w.state.was_seen(key))

        self.assertFalse(any(c[1] == '/ingest/verify' for c in self.calls), 'Unowned or duplicate claims never authorize HTTP')

    def test_duplicate_seen_claim_custody_is_held_instead_of_blanket_forgotten(self):
        item, key = self.reserve_unattempted()
        self.w.state.d['seen'].append(self.w.state._k(key))
        self.expire_time()
        self.w.flush_outbox()
        self.assertIs(self.w.state.d['outbox'][1], item)
        self.assertEqual(self.w.state.d['seen'].count(self.w.state._k(key)), 2)

        self.assertFalse(any(c[1] == '/ingest/verify' for c in self.calls), 'Unowned or duplicate claims never authorize HTTP')

    def test_unknown_server_expiry_settlement_save_restores_claim_and_blocks_new_http(self):
        item, key = self.reserve_unattempted()
        self.expire_time()
        save = self.w.state.save
        def uncertain_save():
            if all(entry is not item for entry in self.w.state.d['outbox']):
                raise OSError('synthetic expiry write outcome unknown')
            save()
        with patch.object(self.w.state, 'save', side_effect=uncertain_save):
            self.w.flush_outbox()
        self.assertIs(self.w.state.d['outbox'][1], item)
        self.assertTrue(self.w.state.was_seen(key))
        self.assertTrue(self.w._custody_halted)
        before = len(self.calls)
        self.w.flush_outbox()
        self.assertEqual(len(self.calls), before)
        self.assertTrue(item['acknowledged'])
        self.assertTrue(item['server_expired'])
        self.assertEqual(self.w._ack_settlement_pending, ('outbox', item))
        self.assertTrue(self.w.recover_local_settlement())
        self.assertEqual(len(self.calls), before, 'Known original ACK permits local persistence only, never another HTTP request')
        self.assertEqual(self.w.state.d['outbox'], [self.older_original])
        self.assertEqual(self.older_original, self.older_before)
        self.assertFalse(self.w.state.was_seen(key))

    def test_local_expiry_result_is_falsey_and_not_delivered(self):
        self.assertFalse(bool(watcher.Delivery.EXPIRED_LOCAL))
        self.assertIsNot(watcher.Delivery.EXPIRED_LOCAL, watcher.Delivery.DELIVERED)

    def real_worker_call(self):
        self.w.worker.call = watcher.Worker.call.__get__(self.w.worker, watcher.Worker)

    @staticmethod
    def http_response(value):
        return urllib.response.addinfourl(io.BytesIO(json.dumps(value).encode('utf-8')), {}, 'https://test.invalid', 200)

    def test_real_worker_shared_pause_does_not_spend_original_before_http(self):
        self.admit()
        self.real_worker_call()
        requests = []
        def open_request(req, timeout):
            requests.append(req)
            if req.get_method() == 'GET':
                failure = urllib.error.HTTPError(req.full_url, 429, 'synthetic rate limit', {'Retry-After': '60'}, io.BytesIO(b'not logged'))
                self.addCleanup(failure.close)
                raise failure
            return self.http_response(dict(result='member', roleOutcome='granted', roleGranted=True, pendingConsumed=True))
        with patch.object(self.w.worker.opener, 'open', side_effect=open_request):
            ok, _ = self.w.worker.call('GET', '/queue', retries=1)
            self.assertFalse(ok)
            self.assertIsNotNone(self.w.worker.paused())
            self.w.handle_chat_line(self.line())
            item = self.w.state.d['outbox'][0]
            original = self.w._verification_originals[id(item)]
            self.assertEqual(len(requests), 1, 'Only the earlier GET reached HTTP')
            self.assertFalse(original['attempted'], 'A local pause is not a verification request attempt')
            self.at += 62
            self.now.return_value = self.at
            self.w.flush_outbox()
            self.assertEqual([r.get_method() for r in requests], ['GET', 'POST'])
            self.assertEqual(json.loads(requests[1].data), item['body'])
            self.assertTrue(original['attempted'])
            self.assertEqual(self.w.state.d['outbox'], [])
            self.w.flush_outbox()
            self.assertEqual(len(requests), 2)

    def test_real_worker_long_pause_preserves_source_until_server_expiry_then_new_whisper_recovers(self):
        self.admit()
        self.real_worker_call()
        requests = []
        def open_request(req, timeout):
            requests.append(req)
            if req.get_method() == 'GET':
                failure = urllib.error.HTTPError(req.full_url, 429, 'synthetic long pause', {'Retry-After': '900'}, io.BytesIO(b'not logged'))
                self.addCleanup(failure.close)
                raise failure
            if req.full_url.split('?', 1)[0].endswith('/ingest/roster'):
                return self.http_response(dict(snapshot=8, trusted=True, members=2))
            original = json.loads(req.data)
            if original.get('ts', self.at) <= self.at - 600:
                return self.http_response(dict(result='source_expired', pendingConsumed=False, roleGranted=False, inviteQueued=False))
            return self.http_response(dict(result='member', roleGranted=True))
        with patch.object(self.w.worker.opener, 'open', side_effect=open_request):
            self.w.worker.call('GET', '/queue', retries=1)
            self.w.handle_chat_line(self.line())
            item = self.w.state.d['outbox'][0]
            old_proof = copy.deepcopy(item['body']['nativeMembership'])
            self.expire_time()
            self.w.flush_outbox()
            self.assertEqual(len(requests), 1)
            self.assertIs(self.w.state.d['outbox'][0], item)
            self.assertTrue(self.w.state.was_seen(self.w.code_key('w', NAME, self.code)))
            self.assertFalse(self.w._verification_originals[id(item)]['attempted'])
            self.read_native_roster()  # Its real call is still locally paused.
            self.assertEqual(len(requests), 1)
            self.at += 301
            self.now.return_value = self.at
            self.w.flush_outbox()
            self.assertTrue(self.w.verification_roster_ready(self.body()))
            self.w.forward_events([dict(type='whisper', name=NAME, guid=GUID, code=self.code, ok=True,
                                       ts=self.at, nativeMembership=self.proof())])
            posts = [json.loads(r.data) for r in requests if r.get_method() == 'POST' and r.full_url.split('?', 1)[0].endswith('/ingest/verify')]
            self.assertEqual(len(posts), 2)
            self.assertEqual(posts[0]['nativeMembership'], old_proof)
            self.assertEqual(posts[1]['nativeMembership'], self.proof())
            self.assertNotEqual(posts[1]['nativeMembership'], old_proof)
            self.assertEqual(self.w.state.d['outbox'], [])

    def test_real_verification_http429_remains_attempted_and_cannot_expire(self):
        self.admit()
        self.real_worker_call()
        failure = urllib.error.HTTPError('https://test.invalid/ingest/verify', 429, 'synthetic request refused', {'Retry-After': '60'}, io.BytesIO(b'not logged'))
        self.addCleanup(failure.close)
        with patch.object(self.w.worker.opener, 'open', side_effect=failure) as transport:
            self.w.handle_chat_line(self.line())
            item = self.w.state.d['outbox'][0]
            self.assertTrue(self.w._verification_originals[id(item)]['attempted'])
            self.expire_time()
            self.w.flush_outbox()
            self.w.forward_events([dict(type='whisper', name=NAME, guid=GUID, code=self.code, ok=True,
                                       ts=self.at, nativeMembership=self.proof())])
            self.assertEqual(transport.call_count, 1)
            self.assertIs(self.w.state.d['outbox'][0], item)
            self.assertTrue(self.w.state.was_seen(self.w.code_key('w', NAME, self.code)))

    def test_a_paused_response_dict_never_recreates_an_unattempted_original(self):
        self.admit()
        self.w.worker.call = lambda *a, **k: (self.calls.append((a, k)) or (False, {'paused': True}))
        self.w.handle_chat_line(self.line())
        item = self.w.state.d['outbox'][0]
        self.assertTrue(self.w._verification_originals[id(item)]['attempted'])
        self.expire_time()
        self.w.flush_outbox()
        self.assertEqual(len(self.calls), 1)
        self.assertIs(self.w.state.d['outbox'][0], item)


    def invite_body233(self):
        p = dict(version=233, proofId='1' * 32, fullName=NAME, unitGuid=GUID, unitFullName=NAME,
                 whisperAt=self.at, requestedAt=self.at, observedAt=self.at,
                 scopeHash=hashlib.sha256(('native-scope|1|' + GUILD + '|' + REALM).encode()).hexdigest()[:16],
                 guildState='unguilded', source=officer_invites233.SOURCE, before='2' * 64, after='3' * 64)
        body = dict(character=NAME, code=self.code, guid=GUID, source='whisper', nativeInvite=p)
        p['mac'] = officer_invites233.proof_mac(SECRET, body)
        return body

    def invite_admit233(self):
        roster = self.roster()
        roster['members'] = roster['members'][:1]
        roster['total'] = 1
        db = dict(roster=roster, lastCharacterGuid='Player-1-00000001', events=[])
        self.w.sv_file.parent.mkdir(parents=True, exist_ok=True)
        self.w.sv_file.write_text('OlympusVerifyDB = ' + lua(db), encoding='utf-8')
        self.w.check_savedvars()
        self.assertTrue(self.w.officer_invite_roster_ready(self.invite_body233()))
        self.calls.clear()

    def invite_receipt233(self, body, held=False):
        result = dict(protocol=officer_invites233.PROTOCOL, proofId=body['nativeInvite']['proofId'],
                      result='held' if held else 'queued', reason='knight-standing-required' if held else 'knight-unguilded',
                      inviteQueued=not held, roleGranted=False, pendingConsumed=False)
        if not held:
            result.update(queueId=1, expiresAt=body['nativeInvite']['observedAt'] + 60)
        return result

    def test_officer233_positive_original_dedicated_once_and_no_role_authority(self):
        self.invite_admit233()
        body = self.invite_body233()
        def response(method, path, original=None, retries=3):
            self.calls.append((method, path, copy.deepcopy(original), retries))
            return True, self.invite_receipt233(original)
        self.w.worker.call = response
        self.w.forward_officer_invite(body)
        self.w.forward_events([dict(type='officer_invite_proof', body=body)])
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.calls[0], ('POST', officer_invites233.PATH, body, 1))
        self.assertEqual(self.w.state.d['outbox'], [])
        self.assertFalse(self.w.state.was_seen(self.w.code_key('w', NAME, self.code)))

    def test_officer233_raw_false_chat_and_saved_event_do_not_spend_membership(self):
        self.invite_admit233()
        proof = dict(self.proof(), member=False)
        proof['mac'] = membership_mac(SECRET, NAME, GUID, self.code, proof)
        line = self.line().replace(' 1 ', ' 0 ').replace(self.proof()['mac'], proof['mac'])
        self.w.handle_chat_line(line)
        self.w.forward_events([dict(type='whisper', name=NAME, guid=GUID, code=self.code, ok=True, ts=self.at, nativeMembership=proof)])
        self.assertEqual((self.calls, self.w.state.d['outbox']), ([], []))
        self.assertFalse(self.w.state.was_seen(self.w.code_key('w', NAME, self.code)))

    def test_officer233_no_original_roster_ack_never_reserves_or_dispatches(self):
        with self.assertRaises(watcher.VerificationDeferred):
            self.w.forward_officer_invite(self.invite_body233())
        self.assertEqual((self.calls, self.w.state.d['outbox']), ([], []))

    def test_officer233_malformed_proofs_never_enter_transport(self):
        self.invite_admit233()
        for key, value in [('guildState', 'unknown'), ('unitGuid', 'Player-1-00000000'), ('unitFullName', 'Other'), ('after', '2' * 64), ('mac', '0' * 32), ('observedAt', self.at - 60)]:
            body = self.invite_body233()
            body['nativeInvite'][key] = value
            self.w.forward_officer_invite(body)
        self.assertEqual((self.calls, self.w.state.d['outbox']), ([], []))

    def test_officer233_actual_local_pause_retains_unattempted_then_sends_once(self):
        self.invite_admit233()
        self.w.worker._pause_data()['worker_retry_at'] = self.at + 30
        self.w.forward_officer_invite(self.invite_body233())
        item = self.w.state.d['outbox'][0]
        self.assertFalse(self.w._verification_originals[id(item)]['attempted'])
        self.assertEqual(self.calls, [])
        self.w.worker._pause_data()['worker_retry_at'] = 0
        self.w.worker.call = lambda method, path, body=None, retries=3: (self.calls.append((method, path, body, retries)) or (True, self.invite_receipt233(body)))
        self.w.flush_outbox()
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.w.state.d['outbox'], [])

    def test_officer233_exact_held200_finishes_local_delivery_without_membership_claim(self):
        self.invite_admit233()
        self.w.worker.call = lambda method, path, body=None, retries=3: (True, self.invite_receipt233(body, held=True))
        self.w.forward_officer_invite(self.invite_body233())
        self.assertEqual(self.w.state.d['outbox'], [])
        self.assertFalse(self.w.state.was_seen(self.w.code_key('w', NAME, self.code)))

    def test_officer233_generic_success_is_unknown_and_never_resent(self):
        self.invite_admit233()
        self.w.worker.call = lambda *a, **k: (self.calls.append((a, k)) or (True, {'result': 'ok'}))
        self.w.forward_officer_invite(self.invite_body233())
        item = self.w.state.d['outbox'][0]
        self.assertTrue(self.w._verification_originals[id(item)]['attempted'])
        self.at += 61; self.now.return_value = self.at
        self.w.flush_outbox()
        self.assertEqual(len(self.calls), 1)
        self.assertIs(self.w.state.d['outbox'][0], item)

    def test_officer233_unknown_original_stays_held_while_fresh_roster_and_member_progress(self):
        self.invite_admit233()
        self.w.worker.call = lambda method, path, body=None, retries=3: (self.calls.append((method, path, copy.deepcopy(body), retries)) or (False, None))
        self.w.forward_officer_invite(self.invite_body233())
        item = self.w.state.d['outbox'][0]
        before = copy.deepcopy(item)
        self.w.worker.call = self.transport
        self.at += 1; self.now.return_value = self.at
        self.read_native_roster()
        self.w.forward_events([dict(type='whisper', name=NAME, guid=GUID, code=self.code, ok=True, ts=self.at, nativeMembership=self.proof())])
        self.w.flush_outbox()
        self.assertIs(self.w.state.d['outbox'][0], item)
        self.assertEqual(item, before)
        self.assertEqual(len([x for x in self.calls if x[1] == officer_invites233.PATH]), 1)
        self.assertEqual(len([x for x in self.calls if x[1] == '/ingest/verify']), 1)

    def test_officer233_prior_unknown_or_refused_original_is_never_relabelled_by_fresh_invite(self):
        for refused in (False, True):
            with self.subTest(refused=refused):
                self.w = watcher.Watcher(dict(self.cfg, state_file=str(self.root / ('separate' + str(refused) + '.json'))))
                self.w.worker.call = self.transport
                self.invite_admit233()
                self.w.worker.call = lambda *a, **k: (False, None)
                self.w.post('/ingest/events', {'events': []}, 'older uncertain')
                item = self.w.state.d['outbox'][0]
                if refused: item['refusal_status'] = 403
                before = copy.deepcopy(item)
                self.calls.clear()
                self.w.worker.call = lambda method, path, body=None, retries=3: (self.calls.append((method, path, copy.deepcopy(body), retries)) or (False, None))
                self.w.forward_officer_invite(self.invite_body233())
                self.w.flush_outbox()
                self.assertEqual(item, before)
                self.assertIs(self.w.state.d['outbox'][0], item)
                self.assertEqual(len([x for x in self.calls if x[1] == officer_invites233.PATH]), 1)
                self.assertEqual(len(self.w.state.d['outbox']), 2)

    def test_officer233_restart_cannot_acquire_fresh_original_or_resend(self):
        self.invite_admit233()
        self.w.worker.call = lambda *a, **k: (False, None)
        self.w.forward_officer_invite(self.invite_body233())
        self.w = watcher.Watcher(self.cfg)
        self.w.worker.call = self.transport
        self.calls.clear()
        self.w.flush_outbox()
        self.assertTrue(self.w.state.d['outbox'])
        self.assertEqual(self.calls, [])

    def test_officer233_expired_original_persists_until_explicit_server_no_effect_receipt(self):
        self.invite_admit233()
        self.w.worker._pause_data()['worker_retry_at'] = self.at + 120
        body = self.invite_body233()
        self.w.forward_officer_invite(body)
        original = self.w.state.d['outbox'][0]
        key = 'officer-invite233:' + body['nativeInvite']['proofId']
        self.at += 60; self.now.return_value = self.at
        self.w.flush_outbox()
        self.assertIs(self.w.state.d['outbox'][0], original)
        self.assertTrue(self.w.state.was_seen(key))
        self.assertEqual(self.calls, [], 'A local pause or source age is never server delivery')
        def expired_response(method, path, source=None, retries=3):
            self.calls.append((method, path, copy.deepcopy(source), retries))
            receipt = self.invite_receipt233(source, held=True)
            receipt['reason'] = 'native-source-expired'
            return True, receipt
        self.w.worker.call = expired_response
        self.at += 61; self.now.return_value = self.at
        self.w.flush_outbox()
        self.assertEqual(self.calls, [('POST', officer_invites233.PATH, body, 1)])
        self.assertEqual(self.w.state.d['outbox'], [])
        self.assertFalse(self.w.state.was_seen(key))
        self.assertTrue(original['acknowledged'])
        self.assertTrue(original['server_expired'])

    def test_officer233_mutated_unattempted_original_cannot_expire_or_send(self):
        self.invite_admit233()
        self.w.worker._pause_data()['worker_retry_at'] = self.at + 120
        self.w.forward_officer_invite(self.invite_body233())
        item = self.w.state.d['outbox'][0]
        item['body']['nativeInvite']['observedAt'] -= 1
        self.at += 61; self.now.return_value = self.at
        self.w.flush_outbox()
        self.assertIs(self.w.state.d['outbox'][0], item)
        self.assertEqual(self.calls, [])

    def spent_head626(self, restart=False):
        self.admit()
        self.w.worker.call = lambda method, path, body=None, retries=3: (self.calls.append((method, path, copy.deepcopy(body), retries)) or (False, None))
        self.w.handle_chat_line(self.line())
        head = self.w.state.d['outbox'][0]
        before = json.dumps(head, sort_keys=True)
        if restart:
            self.w = watcher.Watcher(self.cfg)
            head = self.w.state.d['outbox'][0]
            self.assertEqual(json.dumps(head, sort_keys=True), before)
        self.calls.clear()
        self.w.worker.call = self.transport
        return head, before

    def test_626_reloaded_unknown_head_does_not_block_a_genuinely_new_roster(self):
        head, before = self.spent_head626(restart=True)
        self.w.forward_roster(self.roster())
        self.assertEqual(self.calls, [], 'The committed old export watermark is never reset or replayed')
        self.at += 1; self.now.return_value = self.at
        self.read_native_roster()
        self.assertEqual([c[1] for c in self.calls], ['/ingest/roster'])
        self.assertTrue(self.w.verification_roster_ready(self.body()))
        self.assertEqual(self.w.state.d['outbox'], [head])
        self.assertIs(self.w.state.d['outbox'][0], head)
        self.assertEqual(json.dumps(head, sort_keys=True), before)
        self.assertEqual(json.loads(self.w.state.path.read_text())['outbox'], [head])
        self.w.flush_outbox()
        self.assertEqual(len(self.calls), 1, 'The old unknown verification never receives another HTTP attempt')

    def test_626_nonhead_roster_ack_rollback_keeps_index_and_local_recovery_has_no_http(self):
        head, before = self.spent_head626()
        self.at += 1; self.now.return_value = self.at
        save = self.w.state.save
        def fail_settlement():
            if len(self.w.state.d['outbox']) == 1:
                raise OSError('synthetic nonhead settlement outcome unknown')
            save()
        with patch.object(self.w.state, 'save', side_effect=fail_settlement):
            self.read_native_roster()
        item = self.w.state.d['outbox'][1]
        self.assertTrue(item['acknowledged'])
        self.assertTrue(self.w._custody_halted)
        self.assertIs(self.w.state.d['outbox'][0], head)
        self.assertEqual(json.dumps(head, sort_keys=True), before)
        self.assertIsNone(self.w._verification_roster)
        calls = len(self.calls)
        self.w.flush_outbox()
        self.assertEqual(len(self.calls), calls)
        self.assertTrue(self.w.recover_local_settlement())
        self.assertEqual(len(self.calls), calls)
        self.assertEqual(self.w.state.d['outbox'], [head])
        self.assertTrue(self.w.verification_roster_ready(self.body()))

    def test_626_nonhead_expiry_ack_restores_only_its_own_claim_after_failed_save(self):
        item, key = self.reserve_unattempted()
        head = self.w.state.d['outbox'][0]; before = copy.deepcopy(head)
        self.expire_time()
        def expiry(method, path, body=None, retries=3):
            self.calls.append((method, path, copy.deepcopy(body), retries))
            return (False, None) if path == '/ingest/events' else (True, dict(result='source_expired', pendingConsumed=False, roleGranted=False, inviteQueued=False))
        self.w.worker.call = expiry
        save = self.w.state.save
        def fail_settlement():
            if len(self.w.state.d['outbox']) == 1:
                raise OSError('synthetic independent expiry persistence failure')
            save()
        with patch.object(self.w.state, 'save', side_effect=fail_settlement):
            self.w.flush_outbox()
        self.assertEqual(self.w.state.d['outbox'], [head, item])
        self.assertIs(self.w.state.d['outbox'][1], item)
        self.assertEqual(head, before)
        self.assertTrue(item['acknowledged'] and item['server_expired'])
        self.assertTrue(self.w.state.was_seen(key))
        self.assertTrue(self.w._custody_halted)
        calls = len(self.calls)
        self.assertTrue(self.w.recover_local_settlement())
        self.assertEqual(len(self.calls), calls)
        self.assertEqual(self.w.state.d['outbox'], [head])
        self.assertFalse(self.w.state.was_seen(key))

    def test_626_independent_dispatch_never_adopts_unowned_or_changed_originals(self):
        for case in ('changed-rehashed', 'duplicate-claim', 'foreign-owner', 'refused', 'attempted', 'no-roster', 'duplicate-object', 'fake-ack', 'reloaded'):
            with self.subTest(case=case):
                self.cfg = dict(self.cfg, state_file=str(self.root / (case + '.json')))
                self.w = watcher.Watcher(self.cfg)
                self.w.worker.call = self.transport
                item, key = self.reserve_unattempted()
                if case == 'changed-rehashed':
                    item['body']['code'] += 'changed';item['digest'] = self.w._original_digest(item)
                elif case == 'duplicate-claim': self.w.state.d['seen'].append(self.w.state._k(key))
                elif case == 'foreign-owner': self.w.worker.token = 'different-owner'
                elif case == 'refused': item['refusal_status'] = 403
                elif case == 'attempted': self.w._verification_originals[id(item)]['attempted'] = True
                elif case == 'no-roster': self.w._verification_roster = None
                elif case == 'duplicate-object': self.w.state.d['outbox'].append(item)
                elif case == 'fake-ack': item['acknowledged'] = True
                elif case == 'reloaded': self.w = watcher.Watcher(self.cfg)
                self.calls.clear()
                self.w.worker.call = lambda method, path, body=None, retries=3: (self.calls.append((method, path, copy.deepcopy(body), retries)) or (False, None))
                before = copy.deepcopy(self.w.state.d['outbox'])
                self.w.flush_outbox()
                self.assertFalse(any(c[1] == '/ingest/verify' for c in self.calls))
                self.assertEqual(self.w.state.d['outbox'], before)

    def test_626_pause_and_capacity_still_gate_fresh_independent_roster(self):
        head, before = self.spent_head626()
        self.at += 1; self.now.return_value = self.at
        with patch.object(self.w.worker, 'paused', return_value='synthetic auth pause'):
            self.w.forward_roster(self.roster())
            item = self.w.state.d['outbox'][1]
            self.w.flush_outbox()
            self.assertFalse(self.w._independent_originals[id(item)]['attempted'])
            self.assertEqual(self.calls, [])
        self.w.flush_outbox()
        self.assertEqual([c[1] for c in self.calls], ['/ingest/roster'])
        self.assertEqual(self.w.state.d['outbox'], [head])
        self.assertEqual(json.dumps(head, sort_keys=True), before)
        self.w.max_outbox = 1
        self.at += 1; self.now.return_value = self.at
        watermark = self.w.state.d['roster_sent']
        with self.assertRaises(watcher.NoCustody): self.w.forward_roster(self.roster())
        self.assertEqual(self.w.state.d['outbox'], [head])
        self.assertEqual(self.w.state.d['roster_sent'], watermark)
        self.assertEqual(len(self.calls), 1)


class IndependentSweep264Tests(unittest.TestCase):
    """Actual627 transport/caller; only HTTP, clock and synthetic local files are doubled.

    An empty202 is a scheduling acknowledgement, never a Native/identity/role result.
    """

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.at = 1794348000
        self.tick = 1000.0
        wall = patch.object(watcher.time, 'time', side_effect=lambda: self.at)
        mono = patch.object(watcher.time, 'monotonic', side_effect=lambda: self.tick)
        wall.start();mono.start();self.addCleanup(wall.stop);self.addCleanup(mono.stop)
        self.cfg = dict(wow_dir=str(self.root), account='SYNTHETIC', worker_url='https://test.invalid',
                        watcher_token='local-synthetic-wake-token', verify_secret='local-independent-sweep-only',
                        officer_character='Fern Melder', membership_only=True, state_file=str(self.root / 'state.json'))
        self.w = watcher.Watcher(self.cfg)
        self.health = dict(ok=True, build='2026-11-10.264 Independent bounded sweep wake',
                           verification=dict(mode='members-only', nativeScopePinned=True, nativeMembershipProofVersion=1))
        self.cache = dict(presenceOnly=True, entries=[], setGuildNote=False, verificationResults=[], independentRoleWake264=True)
        self.requests = []
        self.wake_responses = []
        self.logs = io.StringIO()
        output = contextlib.redirect_stdout(self.logs);output.__enter__();self.addCleanup(output.__exit__, None, None, None)
        opened = patch.object(self.w.worker.opener, 'open', side_effect=self.transport)
        opened.start();self.addCleanup(opened.stop)
        self.w.pull_strict_display = lambda: None

    def response(self, url, data=b'', status=202, headers=None):
        class ObservedResponse:
            def __init__(self):
                self.status = status
                self.headers = headers or {}
                self.data = io.BytesIO(data)
                self.read_sizes = []
            def __enter__(self): return self
            def __exit__(self, *args): self.data.close()
            def geturl(self): return url
            def read(self, size=-1):
                self.read_sizes.append(size)
                return self.data.read(size)
        return ObservedResponse()

    def transport(self, request, timeout):
        self.requests.append((request, timeout))
        parsed = urllib.parse.urlsplit(request.full_url)
        self.assertEqual(parsed.scheme + '://' + parsed.netloc, 'https://test.invalid')
        if request.get_method() == 'GET' and parsed.path == '/health':
            return self.response(request.full_url, json.dumps(self.health).encode(), 200)
        if request.get_method() == 'GET' and parsed.path == '/queue':
            body = self.cache if urllib.parse.parse_qs(parsed.query).get('cacheOnly242') == ['1'] else dict(presenceOnly=True, entries=[], setGuildNote=False)
            return self.response(request.full_url, json.dumps(body).encode(), 200)
        if request.get_method() == 'POST' and parsed.path == '/internal/roles242/continue':
            self.assertEqual(parsed.query, '')
            result = self.response(request.full_url)
            self.wake_responses.append(result)
            return result
        raise AssertionError('unplanned synthetic HTTP')

    def startup(self):
        self.w.require_launch_worker()
        self.requests.clear()

    def wakes(self):
        return [(request, timeout) for request, timeout in self.requests if request.get_method() == 'POST']

    def test_627_exact_fresh_hmac_wire_has_no_account_or_role_authority(self):
        self.startup()
        self.assertTrue(any(isinstance(handler, watcher.NoRedirect) for handler in self.w.worker.opener.handlers))
        self.assertTrue(self.w.worker.wake_sweep264(self.w.secret))
        self.assertEqual(len(self.wakes()), 1)
        request, timeout = self.wakes()[0]
        self.assertEqual(request.full_url, 'https://test.invalid/internal/roles242/continue')
        self.assertEqual(timeout, 20)
        headers = {key.lower(): value for key, value in request.header_items()}
        self.assertEqual(headers['authorization'], 'Bearer ' + self.cfg['watcher_token'])
        self.assertEqual(headers['content-type'], 'application/json')
        self.assertEqual(headers['user-agent'], 'olympus-verify-watcher/'+watcher.WATCHER_VERSION)
        body = json.loads(request.data)
        self.assertEqual(set(body), {'kind', 'at', 'nonce', 'independent'})
        self.assertEqual(body['kind'], 'sweep');self.assertIs(body['independent'], True)
        self.assertIs(type(body['at']), int);self.assertEqual(body['at'], self.at)
        nonce = uuid.UUID(body['nonce']);self.assertEqual(nonce.version, 4);self.assertEqual(str(nonce), body['nonce'])
        self.assertEqual(headers['x-olympus-role-continuation'], hmac.new(self.w.secret.encode(), b'role-continuation242\n' + request.data, hashlib.sha256).hexdigest())
        self.assertEqual(request.data, json.dumps(body, separators=(',', ':')).encode())
        self.assertEqual(self.wake_responses[0].read_sizes, [1])
        self.assertEqual(self.w.state.d['outbox'], [])
        self.assertIsNone(self.w._verification_roster)

    def test_627_only_empty202_at_the_original_destination_is_schedule_ack(self):
        for status, payload, destination, expected in [(202, b'', 'https://test.invalid/internal/roles242/continue', True),
                (200, b'', 'https://test.invalid/internal/roles242/continue', False),
                (204, b'', 'https://test.invalid/internal/roles242/continue', False),
                (202, b'{}', 'https://test.invalid/internal/roles242/continue', False),
                (202, b' ', 'https://test.invalid/internal/roles242/continue', False),
                (202, b'x' * 4096, 'https://test.invalid/internal/roles242/continue', False),
                (202, b'', 'https://foreign.invalid/internal/roles242/continue', False)]:
            with self.subTest(status=status, payloadBytes=len(payload), foreign='foreign' in destination):
                response = self.response(destination, payload, status)
                with patch.object(self.w.worker.opener, 'open', return_value=response) as opened:
                    self.assertIs(self.w.worker.wake_sweep264(self.w.secret), expected)
                self.assertEqual(opened.call_count, 1)
                self.assertTrue(all(size == 1 for size in response.read_sizes))

    def test_627_auth_rate_and_redirect_refusals_share_the_existing_global_pause(self):
        for status in (401, 403, 429, 302):
            with self.subTest(status=status):
                self.w.worker._pause_data().update(worker_retry_at=0, worker_retry_status=None)
                error = urllib.error.HTTPError('https://test.invalid/internal/roles242/continue', status,
                                              'synthetic private text', {'Retry-After': '120', 'Location': 'https://foreign.invalid/'}, io.BytesIO(b'synthetic private body'))
                with patch.object(self.w.worker.opener, 'open', side_effect=error) as opened, patch.object(watcher.time, 'sleep') as slept:
                    self.assertFalse(self.w.worker.wake_sweep264(self.w.secret))
                    self.assertEqual(opened.call_count, 1);slept.assert_not_called()
                    paused = self.w.worker.paused()
                    self.assertEqual(paused['httpStatus'], status)
                    self.assertGreaterEqual(paused['retryAfterSeconds'], 120 if status == 429 else 900)
                    self.assertFalse(self.w.worker.call('GET', '/health', retries=1)[0])
                    self.assertFalse(self.w.worker.wake_sweep264(self.w.secret))
                    self.assertEqual(opened.call_count, 1)
        self.assertNotIn('synthetic private', self.logs.getvalue())
        self.assertNotIn(self.w.secret, self.logs.getvalue())
        self.assertNotIn(self.cfg['watcher_token'], self.logs.getvalue())

    def test_627_network_unknown_is_one_attempt_without_sleep_or_original_adoption(self):
        before = copy.deepcopy(self.w.state.d)
        with patch.object(self.w.worker.opener, 'open', side_effect=urllib.error.URLError('synthetic private unreachable')) as opened, patch.object(watcher.time, 'sleep') as slept:
            self.assertFalse(self.w.worker.wake_sweep264(self.w.secret))
        self.assertEqual(opened.call_count, 1);slept.assert_not_called()
        self.assertEqual(self.w.state.d, before)
        self.assertNotIn('synthetic private', self.logs.getvalue())

    def test_627_foreign_or_legacy_transport_and_invalid_secret_never_dispatch(self):
        for change in ('origin', 'token', 'legacy', 'secret'):
            with self.subTest(change=change):
                base, token, mode = self.w.worker.base, self.w.worker.token, self.w.worker.membership_only
                if change == 'origin': self.w.worker.base = 'https://foreign.invalid'
                elif change == 'token': self.w.worker.token = 'different-synthetic-token'
                elif change == 'legacy': self.w.worker.membership_only = False
                with patch.object(self.w.worker.opener, 'open', side_effect=AssertionError('no foreign request')) as opened:
                    self.assertFalse(self.w.worker.wake_sweep264('' if change == 'secret' else self.w.secret))
                    opened.assert_not_called()
                self.w.worker.base, self.w.worker.token, self.w.worker.membership_only = base, token, mode

    def test_627_actual_successful_cache_poll_uses_monotonic30s_and_new_nonces(self):
        self.startup()
        self.w.pull_queue()
        self.assertEqual(len(self.wakes()), 1)
        first = json.loads(self.wakes()[0][0].data)
        self.at += 300;self.tick += 29.999
        self.w.pull_queue()
        self.assertEqual(len(self.wakes()), 1, 'A forward wall-clock jump cannot replace the monotonic interval')
        self.at += 31;self.tick = 1030.0
        self.w.pull_queue()
        self.assertEqual(len(self.wakes()), 2)
        second = json.loads(self.wakes()[1][0].data)
        self.assertNotEqual(first['nonce'], second['nonce'])
        self.assertIn('scheduling acknowledged; no role outcome observed', self.logs.getvalue())

    def test_627_unknown_wake_consumes_cadence_without_replaying_its_nonce(self):
        self.startup()
        with patch.object(self.w.worker, 'wake_sweep264', return_value=False) as wake:
            self.w._optional_role_wake264(self.cache)
            self.tick += 29.9;self.w._optional_role_wake264(self.cache)
            self.assertEqual(wake.call_count, 1)
            self.tick = 1030.0;self.w._optional_role_wake264(self.cache)
            self.assertEqual(wake.call_count, 2)
        self.assertNotIn('scheduling acknowledged', self.logs.getvalue())

    def test_627_rollback_without_each_reply_capability_keeps_cache_and_intake_usable(self):
        self.startup()
        self.cache.pop('independentRoleWake264')
        self.w.pull_queue()
        self.assertEqual(len(self.wakes()), 0)
        self.assertEqual(len(self.requests), 2)
        self.assertIsNone(self.w._last_role_wake264)
        self.assertFalse(self.w._custody_halted)
        self.health['build'] = '2026-11-10.263 Owned sweep lease cleanup'
        self.w.require_launch_worker();self.requests.clear();self.cache['independentRoleWake264'] = True
        self.w._optional_role_wake264(self.cache)
        self.assertEqual(self.wakes(), [])

    def test_627_failed_authenticated_presence_or_cache_read_never_wakes(self):
        for failed_cache in (False, True):
            with self.subTest(failed_cache=failed_cache):
                self.startup();self.w._last_queue_pull = 0
                original = self.transport
                def failure(request, timeout):
                    query = urllib.parse.parse_qs(urllib.parse.urlsplit(request.full_url).query)
                    is_cache = query.get('cacheOnly242') == ['1']
                    if request.get_method() == 'GET' and urllib.parse.urlsplit(request.full_url).path == '/queue' and is_cache is failed_cache:
                        self.requests.append((request, timeout))
                        raise urllib.error.HTTPError(request.full_url, 503, 'synthetic private refusal', {}, io.BytesIO(b'not logged'))
                    return original(request, timeout)
                with patch.object(self.w.worker.opener, 'open', side_effect=failure), patch.object(watcher.time, 'sleep'):
                    self.w.pull_queue()
                self.assertEqual(self.wakes(), [])
                self.assertIsNone(self.w._last_role_wake264)
                self.assertFalse(self.w._custody_halted)

    def test_627_startup_scope_and_each_cache_literal_are_mandatory(self):
        self.startup()
        for cache in (None, {}, dict(self.cache, presenceOnly=False), dict(self.cache, independentRoleWake264=False),
                      dict(self.cache, independentRoleWake264=1), dict(self.cache, independentRoleWake264='true')):
            with self.subTest(cache=cache): self.w._optional_role_wake264(cache)
        self.assertEqual(self.wakes(), [])
        self.assertIsNone(self.w._last_role_wake264)
        self.health['verification']['nativeScopePinned'] = False
        with self.assertRaises(watcher.LaunchNotReady): self.w.require_launch_worker()
        self.requests.clear();self.w._optional_role_wake264(self.cache)
        self.assertEqual(self.wakes(), [])

    def test_627_current_origin_token_officer_halt_and_pause_gates_are_preserved(self):
        self.startup()
        for change in ('origin', 'token', 'officer', 'halt', 'pause', 'mode'):
            with self.subTest(change=change):
                base, token, officer, mode = self.w.worker.base, self.w.worker.token, self.w.officer_id, self.w.membership_only
                if change == 'origin': self.w.worker.base = 'https://foreign.invalid'
                elif change == 'token': self.w.worker.token = 'changed-synthetic-token'
                elif change == 'officer': self.w.officer_id = 'Another Collector'
                elif change == 'halt': self.w._custody_halted = True
                elif change == 'pause': self.w.worker._pause_data()['worker_retry_at'] = self.at + 60
                elif change == 'mode': self.w.membership_only = False
                self.w._optional_role_wake264(self.cache)
                self.assertEqual(self.wakes(), [])
                self.assertIsNone(self.w._last_role_wake264)
                self.w.worker.base, self.w.worker.token, self.w.officer_id, self.w.membership_only = base, token, officer, mode
                self.w._custody_halted = False;self.w.worker._pause_data()['worker_retry_at'] = 0

    def test_627_schedule_ack_never_reads_or_settles_customer_outbox_or_role_receipts(self):
        self.startup()
        self.w.state.d['outbox'] = [{'path': '/ingest/verify', 'body': {'opaque': 'old unknown original'}, 'acknowledged': False}]
        self.w.state.d['seen'] = ['retained-claim']
        self.w.state.save()
        before = copy.deepcopy(self.w.state.d);disk = self.w.state.path.read_bytes()
        with patch.object(self.w, 'post', side_effect=AssertionError('no customer original')) as post, \
                patch.object(self.w, '_dispatch_original', side_effect=AssertionError('no original replay')) as dispatch, \
                patch.object(self.w.state, 'save', side_effect=AssertionError('no ACK/state adoption')) as save:
            self.w.pull_queue()
        self.assertEqual(len(self.wakes()), 1)
        post.assert_not_called();dispatch.assert_not_called();save.assert_not_called()
        self.assertEqual(self.w.state.d, before);self.assertEqual(self.w.state.path.read_bytes(), disk)
        self.assertIsNone(self.w._verification_roster)
        self.assertEqual(self.w._verification_originals, {})
        self.assertEqual(self.w._independent_originals, {})


if __name__ == '__main__':
    unittest.main()

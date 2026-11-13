"""Native whisper membership proof parsing and actual Watcher custody boundaries."""
from __future__ import annotations

from datetime import datetime, timezone
import copy
import contextlib
import io
import json
import hashlib
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.parse
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import codes
import watcher
from native_membership227 import membership_mac, parse_membership_note, validate_membership

SECRET = 'local-native-membership-test-key'
NAME = 'Aelin Stormwarden'
GUID = 'Player-1234-00ABCDEF'


class NativeMembershipTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.at = int(time.time())
        self.code = codes.code_for(SECRET, NAME, codes.day_bucket(datetime.now(timezone.utc)))
        self.w = watcher.Watcher(dict(wow_dir=str(self.root), account='LOCAL_TEST', worker_url='https://test.invalid', watcher_token='test-token', verify_secret=SECRET, officer_character='Fern Melder', membership_only=True, state_file=str(self.root / 'state.json')))
        self.calls = []
        self.w.worker.call = lambda method, path, body=None, retries=3: (self.calls.append((path, body)) or (True, {'trusted': True, 'snapshot': 1, 'members': len(body['members'])} if path == '/ingest/roster' else {'result': 'ok'}))
        native=dict(roster=dict(exportedAt=self.at,total=2,nativeGuild='OLYMPUS PRIME',nativeRealm='Synthetic Realm',members=[
            dict(name='Fern Melder',guid='Player-1-00000001',rank='Guild Master',rankIndex=0,level=60),
            dict(name=NAME,guid=GUID,rank='Member',rankIndex=7,level=60)]),lastCharacterGuid='Player-1-00000001',events=[])
        self.w.sv_file.parent.mkdir(parents=True,exist_ok=True)
        self.w.sv_file.write_text('OlympusVerifyDB='+watcher.launch_operations229._lua(native),encoding='utf-8')
        self.w.check_savedvars()
        self.calls.clear()

    def tearDown(self):
        self.tmp.cleanup()

    def proof(self, **changes):
        value = dict(version=1, member=True, observedAt=self.at, scopeHash=hashlib.sha256(b'native-scope|1|OLYMPUS PRIME|Synthetic Realm').hexdigest()[:16])
        value.update(changes)
        value['mac'] = membership_mac(SECRET, NAME, GUID, self.code, value)
        return value

    def line(self, proof=None, recipient='Fern Melder'):
        proof = self.proof() if proof is None else proof
        return f"11/3 12:00:00.000  To {recipient}: Olympus: member {NAME} {GUID} {self.code} {1 if proof['member'] else 0} {proof['observedAt']} {proof['scopeHash']} (ref OLVm-{proof['mac']})"

    def test_actual_signed_packet_dispatches_once_and_carries_exact_proof(self):
        self.w.handle_chat_line(self.line())
        self.w.handle_chat_line(self.line())
        self.assertEqual(len(self.calls), 1)
        path, body = self.calls[0]
        self.assertEqual(path, '/ingest/verify')
        self.assertEqual(body['guid'], GUID)
        self.assertEqual(body['nativeMembership'], self.proof())
        self.assertTrue(self.w.state.was_seen(self.w.code_key('w', NAME, self.code)))

    def test_bare_whisper_or_legacy_identity_never_fabricates_current_membership(self):
        self.w.handle_chat_line(f'11/3 12:00:00.000  {NAME} whispers: !verify {self.code}')
        self.assertEqual(self.calls, [])
        self.assertFalse(self.w.state.was_seen(self.w.code_key('w', NAME, self.code)))
        self.w.handle_chat_line(self.line())
        self.assertEqual(len(self.calls), 1)

    def test_signed_native_false_waits_for_dedicated_positive_officer_proof(self):
        self.w.handle_chat_line(self.line(self.proof(member=False)))
        self.assertEqual(self.calls, [])
        self.assertEqual(self.w.state.d['outbox'], [])
        self.assertFalse(self.w.state.was_seen(self.w.code_key('w', NAME, self.code)))

    def test_incoming_spoof_wrong_self_target_and_tampered_mac_do_not_dispatch(self):
        self.w.handle_chat_line(self.line().replace('To Fern Melder:', 'Stranger whispers:'))
        self.w.handle_chat_line(self.line(recipient='Another Collector'))
        proof = self.proof()
        proof['mac'] = '0' * 32
        self.w.handle_chat_line(self.line(proof))
        self.assertEqual(self.calls, [])

    def test_expiry_future_and_strict_boolean_version_shape(self):
        for changes in ({'observedAt': self.at - 600}, {'observedAt': self.at + 6}, {'member': 1}, {'version': True}, {'extra': True}):
            self.assertIsNone(validate_membership(SECRET, NAME, GUID, self.code, self.proof(**changes), self.at), changes)

    def test_each_identity_component_is_mac_bound(self):
        proof = self.proof()
        self.assertIsNone(validate_membership(SECRET, NAME + ' Other', GUID, self.code, proof, self.at))
        self.assertIsNone(validate_membership(SECRET, NAME, 'Player-1234-00ABCDED', self.code, proof, self.at))
        altered = dict(proof, scopeHash='b' * 16)
        self.assertIsNone(validate_membership(SECRET, NAME, GUID, self.code, altered, self.at))

    def test_actual_lua_golden_vector_matches_without_a_game_or_real_key(self):
        proof = dict(version=1, member=True, observedAt=1793720000, scopeHash='a32080270acf8d2f')
        self.assertEqual(membership_mac('synthetic-per-whisper-only', 'Fresh Member-Realm', 'Player-1-ABCDEF12', '8ALCWJ', proof), 'a386604f5049ee4c67b2518c302c1b48')

    def test_savedvariables_fallback_requires_and_preserves_real_proof(self):
        base = dict(type='whisper', name=NAME, ts=self.at, code=self.code, ok=True, guid=GUID)
        self.w.forward_events([base])
        self.assertEqual(self.calls, [])
        self.w.forward_events([{**base, 'nativeMembership': self.proof()}])
        self.assertEqual(len(self.calls), 1)
        self.w.handle_chat_line(self.line())
        self.assertEqual(len(self.calls), 1)

    def test_invalid_mode_cannot_silently_select_legacy(self):
        with self.assertRaisesRegex(ValueError, 'membership_only'):
            watcher.Watcher({**self.w.cfg, 'membership_only': 'true'})

    def test_startup_never_ingests_into_old_or_unqualified_worker(self):
        for response in ({'ok': True, 'build': 'old'}, {'ok': True, 'verification': {'mode': 'legacy', 'nativeScopePinned': True, 'nativeMembershipProofVersion': 1}}, {'ok': True, 'verification': {'mode': 'members-only', 'nativeScopePinned': False, 'nativeMembershipProofVersion': 1}}, {'ok': True, 'verification': {'mode': 'members-only', 'nativeScopePinned': True, 'nativeMembershipProofVersion': True}}):
            calls = []
            self.w.worker.call = lambda method, path, **kwargs: (calls.append((method, path)) or (True, response))
            with self.assertRaises(watcher.LaunchNotReady):
                self.w.require_launch_worker()
            self.assertEqual(calls, [('GET', '/health')])

    def test_current_configured_worker_is_admitted_without_a_game_or_ingest_request(self):
        calls = []
        self.w.worker.call = lambda method, path, **kwargs: (calls.append((method, path)) or (True, {'ok': True, 'verification': {'mode': 'members-only', 'nativeScopePinned': True, 'nativeMembershipProofVersion': 1}}))
        self.w.require_launch_worker()
        self.assertEqual(calls, [('GET', '/health')])

    def test_legacy_startup_has_no_new_network_dependency(self):
        self.w.membership_only = False
        self.w.worker.call = lambda *args, **kwargs: self.fail('Legacy startup changed')
        self.w.require_launch_worker()

    def test_strict_check_uses_actual_versioned_presence_transport_without_writes_or_secrets(self):
        self.w.queue_file.parent.mkdir(parents=True, exist_ok=True)
        self.w.sv_file.parent.mkdir(parents=True, exist_ok=True)
        self.w.sv_file.write_text('-- synthetic native export\n', encoding='utf-8')
        original = b'-- retained legacy queue\n'
        self.w.queue_file.write_bytes(original)
        before = copy.deepcopy(self.w.state.d)
        del self.w.worker.call  # Exercise the real protocol-appending transport, not the setUp stub.
        calls, output = [], io.StringIO()
        health = {'ok': True, 'verification': {'mode': 'members-only', 'nativeScopePinned': True,
                  'nativeMembershipProofVersion': 1}, 'relays': {'requestCodes': True}}

        def answer(request, timeout):
            self.assertEqual(request.get_method(), 'GET')
            self.assertIsNone(request.data)
            parsed = urllib.parse.urlsplit(request.full_url)
            calls.append((parsed.path, urllib.parse.parse_qs(parsed.query)))
            if parsed.path == '/health':
                return io.BytesIO(json.dumps(health).encode())
            # The live route refuses the membership protocol without presenceOnly=1.
            if calls[-1] != ('/queue', {'presenceOnly': ['1'], 'keyVersion': ['launch-membership-v1']}):
                raise urllib.error.HTTPError(request.full_url, 400, 'synthetic protocol refusal', {}, io.BytesIO(b''))
            return io.BytesIO(b'{"presenceOnly":true,"entries":[],"discordId":"999999999999999999"}')

        with patch.object(self.w.worker.opener, 'open', side_effect=answer), contextlib.redirect_stdout(output):
            self.assertEqual(self.w.check(), 0, output.getvalue())
        self.assertEqual(calls, [('/health', {}), ('/queue', {'presenceOnly': ['1'],
                         'keyVersion': ['launch-membership-v1']}), ('/health', {})])
        self.assertEqual(self.w.state.d, before)
        self.assertEqual(self.w.queue_file.read_bytes(), original)
        self.assertFalse(self.w.strict_display_file.exists())
        self.assertFalse(self.w.launch_operations_file.exists())
        for private in (SECRET, 'test-token', GUID, '999999999999999999',
                        codes.valid_codes(SECRET, 'Fern Melder')[0]):
            self.assertNotIn(private, output.getvalue())

    def test_legacy_check_keeps_actual_unversioned_queue_report_and_health_transport(self):
        self.w.queue_file.parent.mkdir(parents=True, exist_ok=True)
        self.w.membership_only = self.w.worker.membership_only = False
        del self.w.worker.call
        calls = []
        responses = {'/queue': {'entries': []}, '/queue/unverified': {'members': [], 'verified': [],
                     'firstSeenAvailable': True, 'build': 'synthetic'}, '/health': {'relays': {'requestCodes': True}}}

        def answer(request, timeout):
            self.assertEqual(request.get_method(), 'GET')
            self.assertIsNone(request.data)
            parsed = urllib.parse.urlsplit(request.full_url)
            self.assertEqual(parsed.query, '')
            calls.append(parsed.path)
            return io.BytesIO(json.dumps(responses[parsed.path]).encode())

        with patch.object(self.w.worker.opener, 'open', side_effect=answer), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(self.w.check(), 0)
        self.assertEqual(calls, ['/queue', '/queue/unverified', '/health'])
        for path in (self.w.queue_file, self.w.strict_display_file, self.w.launch_operations_file):
            self.assertFalse(path.exists())

    def test_strict_check_refuses_unconfirmed_presence_without_legacy_diagnostics(self):
        self.w.queue_file.parent.mkdir(parents=True, exist_ok=True)
        health = {'ok': True, 'verification': {'mode': 'members-only', 'nativeScopePinned': True,
                  'nativeMembershipProofVersion': 1}}
        for response in (None, {}, {'entries': []}, {'presenceOnly': False, 'entries': []},
                         {'presenceOnly': True, 'entries': 'unknown'}):
            with self.subTest(response=response):
                calls = []
                self.w.worker.call = lambda m, p, **kw: (calls.append((m, p)) or (True, health if p == '/health' else response))
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(self.w.check(), 1)
                self.assertEqual(calls, [('GET', '/health'), ('GET', '/queue?presenceOnly=1')])

    def test_strict_check_real_http_refusals_are_not_success_or_ingestion(self):
        self.w.queue_file.parent.mkdir(parents=True, exist_ok=True)
        health = {'ok': True, 'verification': {'mode': 'members-only', 'nativeScopePinned': True,
                  'nativeMembershipProofVersion': 1}}
        for status in (400, 401, 403, 429):
            with self.subTest(status=status):
                self.w.worker = watcher.Worker('https://test.invalid', 'synthetic-only')
                self.w.worker.membership_only = True
                calls = []

                def answer(request, timeout):
                    calls.append((request.get_method(), urllib.parse.urlsplit(request.full_url).path))
                    if calls[-1] == ('GET', '/health'):
                        return io.BytesIO(json.dumps(health).encode())
                    raise urllib.error.HTTPError(request.full_url, status, 'synthetic refusal', {}, io.BytesIO(b'never log this body'))

                with patch.object(self.w.worker.opener, 'open', side_effect=answer), contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(self.w.check(), 1)
                self.assertEqual(calls, [('GET', '/health'), ('GET', '/queue')])

    def test_strict_check_requires_current_health_before_queue(self):
        for health in ({'ok': True}, {'ok': True, 'verification': {'mode': 'legacy'}},
                       {'ok': True, 'verification': {'mode': 'members-only', 'nativeScopePinned': False,
                                                   'nativeMembershipProofVersion': 1}}):
            calls = []
            self.w.worker.call = lambda m, p, **kw: (calls.append((m, p)) or (True, health))
            with self.assertRaises(watcher.LaunchNotReady), contextlib.redirect_stdout(io.StringIO()):
                self.w.check()
            self.assertEqual(calls, [('GET', '/health')])

    def test_positive_cli_requires_strict_mode_without_rewriting_config_or_other_fields(self):
        config = self.root / 'synthetic-startup.json'
        original = {**self.w.cfg, 'membership_only': False}
        config.write_text(json.dumps(original), encoding='utf-8')
        original_bytes = config.read_bytes()
        for force, checking in ((True, True), (True, False), (False, True), (False, False)):
            with self.subTest(force=force, checking=checking), patch.object(watcher, 'Watcher') as constructor:
                constructor.return_value.check.return_value = 0
                argv = ['watcher.py', '--config', str(config)]
                argv += ['--membership-only'] if force else []
                argv += ['--check'] if checking else []
                with patch.object(sys, 'argv', argv), contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(watcher.main(), 0)
                self.assertEqual(constructor.call_args.args[0], {**original, 'membership_only': force})
                (constructor.return_value.check if checking else constructor.return_value.run).assert_called_once_with()
                self.assertEqual(config.read_bytes(), original_bytes)

    def test_cli_absence_preserves_invalid_mode_refusal_and_positive_flag_is_explicit(self):
        config = self.root / 'synthetic-invalid-mode.json'
        for invalid in ('true', 1, None, [], {}):
            config.write_text(json.dumps({**self.w.cfg, 'membership_only': invalid}), encoding='utf-8')
            original = config.read_bytes()
            for force in (False, True):
                output = io.StringIO()
                argv = ['watcher.py', '--config', str(config), '--check'] + (['--membership-only'] if force else [])
                with self.subTest(invalid=invalid, force=force), patch.object(sys, 'argv', argv), \
                        patch.object(watcher.Watcher, 'check', autospec=True, return_value=0) as check, \
                        patch.object(watcher.urllib.request.OpenerDirector, 'open', side_effect=AssertionError('unexpected network')), \
                        contextlib.redirect_stdout(output):
                    self.assertEqual(watcher.main(), 0 if force else 2)
                self.assertEqual(config.read_bytes(), original)
                if force:
                    self.assertIs(check.call_args.args[0].membership_only, True)
                    self.assertIn('mode members-only (required by --membership-only)', output.getvalue())
                else:
                    check.assert_not_called()
                    self.assertIn('membership_only must be a boolean', output.getvalue())

    def test_wow_directory_cli_selects_actual_paths_without_rewriting_config_or_state_location(self):
        selected = self.root / 'selected game with spaces'
        selected.mkdir()
        config = self.root / 'synthetic-game-path.json'
        config.write_text(json.dumps(self.w.cfg), encoding='utf-8')
        original = config.read_bytes()
        for checking in (True, False):
            method = 'check' if checking else 'run'
            argv = ['watcher.py', '--config', str(config), '--membership-only', '--wow-dir', str(selected)]
            argv += ['--check'] if checking else []
            with self.subTest(checking=checking), patch.object(sys, 'argv', argv), \
                    patch.object(watcher.Watcher, method, autospec=True, return_value=0) as action, \
                    contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(watcher.main(), 0)
            instance = action.call_args.args[0]
            self.assertEqual(instance.cfg, {**self.w.cfg, 'wow_dir': str(selected), 'membership_only': True})
            self.assertEqual(instance.sv_file, selected / 'WTF' / 'Account' / 'LOCAL_TEST' / 'SavedVariables' / 'OlympusVerify.lua')
            self.assertEqual(instance.chat_log, selected / 'Logs' / 'WoWChatLog.txt')
            self.assertEqual(instance.queue_file, selected / 'Interface' / 'AddOns' / 'OlympusVerify' / 'OlympusQueue.lua')
            self.assertEqual(instance.state.path, self.w.state.path)
            self.assertEqual(config.read_bytes(), original)

    def test_wow_directory_cli_rejects_empty_relative_missing_and_file_before_lease(self):
        config = self.root / 'synthetic-path-refusal.json'
        config.write_text(json.dumps(self.w.cfg), encoding='utf-8')
        original = config.read_bytes()
        regular = self.root / 'not-a-directory'
        regular.write_text('synthetic', encoding='utf-8')
        for value in ('', ' ', 'relative-game', str(self.root / 'absent'), str(regular)):
            with self.subTest(value=value), patch.object(sys, 'argv', ['watcher.py', '--config', str(config),
                    '--membership-only', '--wow-dir', value, '--check']), patch.object(watcher, 'StateLease') as lease, \
                    patch.object(watcher, 'Watcher') as constructor, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(watcher.main(), 2)
            lease.assert_not_called()
            constructor.assert_not_called()
            self.assertEqual(config.read_bytes(), original)

    def test_strict_check_requires_a_savedvariables_file_in_its_selected_tree(self):
        self.w.sv_file.unlink()
        self.w.queue_file.parent.mkdir(parents=True, exist_ok=True)
        health = {'ok': True, 'verification': {'mode': 'members-only', 'nativeScopePinned': True,
                  'nativeMembershipProofVersion': 1}}
        self.w.worker.call = lambda m, p, **kw: (True, health if p == '/health' else {'entries': [], 'presenceOnly': True})
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(self.w.check(), 1)
            self.w.sv_file.parent.mkdir(parents=True, exist_ok=True)
            self.w.sv_file.mkdir()
            self.assertEqual(self.w.check(), 1)  # A directory at the filename is not an export.
            self.w.sv_file.rmdir()
            self.w.sv_file.write_text('-- synthetic native export\n', encoding='utf-8')
            self.assertEqual(self.w.check(), 0)

    def test_presence_poll_preserves_legacy_queue_and_unknown_acknowledgement(self):
        self.w.queue_file.parent.mkdir(parents=True, exist_ok=True)
        original_file = b'-- retained invitation queue; do not rewrite\r\nOlympusQueue = { entries = {} }\r\n'
        self.w.queue_file.write_bytes(original_file)
        self.w.state.d['queue_written_pending'] = ['retained-id']
        self.w.state.d['queue_written_original'] = {'retained': 'unknown-original'}
        original_state = copy.deepcopy(self.w.state.d)
        self.w.pull_unverified = lambda: self.fail('Membership mode fetched legacy invitation state')
        self.w.render_queue = lambda *args: self.fail('Membership mode rendered an invitation queue')
        self.w.retry_queue_written = lambda: self.fail('Membership mode replayed an old acknowledgement')
        presence = {'presenceOnly': True, 'entries': []}
        fresh = dict(protocol=watcher.STRICT_DISPLAY_PROTOCOL, fetchedAt=self.at, snapshotAt=self.at - 60,
                     guild='Olympus', realm='Fixture Realm', verified=[],unknown=[],
                     unverified=[dict(name=NAME, guid=GUID, pending=False)])
        original_lists = None
        for response, report in ((presence, fresh), (presence, {**fresh, 'snapshotAt': self.at - 3601}),
                                 (presence, {**fresh, 'entries': []}),
                                 (presence, {**fresh, 'unverified': fresh['unverified'] * 2}),
                                 (presence, {**fresh, 'verified': [dict(name='Example', guid='Player-1234-0ABC', status='member', discordId='123', username=None, displayName=None)]}),
                                 (presence, None), ({'entries': [{'id': 'must-not-write'}]}, fresh), (None, fresh)):
            calls = []
            self.w._last_queue_pull = self.w._next_strict_display_pull = 0
            def call(method, path, body=None, retries=3):
                calls.append((method, path, body, retries))
                return True, (report if path == watcher.STRICT_DISPLAY_PATH else response)
            self.w.worker.call = call
            with patch.object(watcher.time, 'time', return_value=self.at):
                self.w.pull_queue()
            self.assertEqual(len(calls), 3 if response is presence else 1)
            method, path, body, retries = calls[0]
            self.assertEqual(method, 'GET')
            self.assertIn('presenceOnly=1', path)
            self.assertIsNone(body)
            self.assertEqual(retries, 1)
            if response is presence:
                self.assertEqual(calls[1], ('GET', watcher.STRICT_DISPLAY_PATH, None, 1))
                self.assertEqual(calls[2], ('GET', '/queue?cacheOnly242=1', None, 1))
            self.assertEqual(self.w.queue_file.read_bytes(), original_file)
            self.assertEqual(self.w.state.d, original_state)
            lists = self.w.strict_display_file.read_bytes()
            if report is fresh and response is presence:
                original_lists = lists
                self.assertEqual(self.w.strict_display_file.name, 'OlympusVerifyLists.lua')
                self.assertIn(b'OlympusVerifyLists = { version = 2', lists)
                self.assertIn(f'snapshotAt = {self.at - 60}'.encode(), lists)
                self.assertIn(GUID.encode(), lists)
                for banned in (b'OlympusQueue', b'entries', b'eligibleAt', b'discordId'):
                    self.assertNotIn(banned, lists)
            self.assertEqual(lists, original_lists)
        self.w._custody_halted = True
        self.w._last_queue_pull = self.w._next_strict_display_pull = 0
        self.w.worker.call = lambda *args, **kwargs: self.fail('Halted custody still polled')
        self.w.pull_queue()
        self.w.pull_strict_display()
        self.assertEqual(self.w.strict_display_file.read_bytes(), original_lists)
        self.assertEqual(self.w.queue_file.read_bytes(), original_file)
        self.assertEqual(self.w.state.d, original_state)

    def test_strict_transport_binds_backward_refused_protocol_without_changing_original_body(self):
        worker = watcher.Worker('https://test.invalid', 'synthetic-only')
        worker.membership_only = True
        original = {'test': 'unchanged-original'}
        for method, path in [('POST', '/ingest/verify'), ('POST', '/ingest/roster'), ('POST', '/ingest/events'), ('GET', '/queue?presenceOnly=1')]:
            with patch.object(worker.opener, 'open', return_value=io.BytesIO(b'{"result":"ok"}')) as transport:
                okay, _ = worker.call(method, path, original if method == 'POST' else None, retries=1)
            self.assertTrue(okay)
            request = transport.call_args.args[0]
            self.assertEqual(request.full_url, 'https://test.invalid' + path + ('&' if '?' in path else '?') + 'keyVersion=launch-membership-v1')
            self.assertEqual(json.loads(request.data) if request.data else None, original if method == 'POST' else None)
        for membership_only, path in [(False, '/ingest/verify'), (True, '/health')]:
            worker.membership_only = membership_only
            with patch.object(worker.opener, 'open', return_value=io.BytesIO(b'{"result":"ok"}')) as transport:
                worker.call('POST' if path.startswith('/ingest/') else 'GET', path, retries=1)
            self.assertEqual(transport.call_args.args[0].full_url, 'https://test.invalid' + path)


    def test_strict_display_transport_is_separately_versioned_and_bounded(self):
        worker = watcher.Worker('https://test.invalid', 'synthetic-only')
        worker.membership_only = True
        path = watcher.STRICT_DISPLAY_PATH
        for raw, wanted in ((b'{}', True), (b' ' * (watcher.STRICT_DISPLAY_MAX_BYTES + 1), False)):
            with patch.object(worker.opener, 'open', return_value=io.BytesIO(raw)) as transport:
                okay, _ = worker.call('GET', path, retries=1)
            self.assertEqual(okay, wanted)
            request = transport.call_args.args[0]
            self.assertEqual(request.full_url, 'https://test.invalid'+watcher.STRICT_DISPLAY_PATH)
            self.assertIsNone(request.data)

if __name__ == '__main__':
    unittest.main(verbosity=2)

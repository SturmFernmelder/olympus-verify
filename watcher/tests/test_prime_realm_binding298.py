"""Blank native realm, on-disk officer identity and exact roster receipt custody."""
import copy
import hashlib
import unittest
import urllib.parse
from unittest.mock import patch

import test_verification_source_witness280 as sources
import test_directive_rank_transition as directive

watcher = sources.watcher
launch = watcher.launch_operations229


class PrimeRealmBinding298Tests(unittest.TestCase):
    def setUp(self):
        self.f = sources.VerificationSourceWitness280Tests()
        self.addCleanup(self.f.doCleanups)
        self.f.setUp()
        self.w = self.f.w
        self.roster = self.f.db['roster']
        self.marker = dict(version=1, kind='prime-guild-master', observerGuid=sources.OFFICER_GUID)
        self.roster.update(nativeRealm='', nativeScopeBinding=self.marker,
                           nativeRankTable=dict(version=1, names=list(watcher.native_rank_attestation.PROFILES[0]['names'])))
        pin = hashlib.sha256(('prime-guild-master|1|' + sources.OFFICER_GUID).encode()).hexdigest()
        for mock in (patch.object(watcher, 'PRIME_GUILD_MASTER_PIN', pin),
                     patch.object(sources, 'REALM', watcher.PRIME_REALM_LABEL)):
            mock.start()
            self.addCleanup(mock.stop)

    def selected_initiates(self):
        self.roster['members'][1].update(rankIndex=9, rank='Initiate')
        c = dict(version=5, action=launch.PRIME_INITIATE_ACTION, id=f'{self.f.at}:1',
                 observedAt=self.f.at, scopeHash=self.f.body()['nativeMembership']['scopeHash'],
                 guid=sources.OFFICER_GUID, targetGuids=[sources.GUID], confirmations='[]')
        c['mac'] = launch.selected_control_mac(sources.SECRET, c)
        self.f.db['launchControl'] = c
        return c

    def test_selected_initiates_uses_exact_original_ack_and_one_read(self):
        c = self.selected_initiates()
        self.roster['exportedAt'] -= 1
        self.w.launch_selected_file.parent.mkdir(parents=True)
        self.f.write()
        self.w.check_savedvars()
        self.assertTrue(self.w.launch_selected.running)
        self.assertIsNone(self.w._launch_accepted_roster)
        self.assertEqual(self.w.launch_scan.phase, 'idle')

        def answer(method, path, retries):
            self.assertEqual((method, retries), ('GET', 1))
            parsed = urllib.parse.urlsplit(path)
            self.assertEqual(parsed.path, '/queue/launch-operations')
            self.assertEqual(urllib.parse.parse_qs(parsed.query), dict(
                keyVersion=['officer-operations-v234'], primeBinding=['prime-guild-master'],
                selectionId=[c['id']], snapshotId=['7'], snapshotAt=[str(self.roster['exportedAt'])],
                actorGuid=[sources.OFFICER_GUID], confirmations=['[]'], targetGuids=['["' + sources.GUID + '"]']))
            fixture = directive.DirectiveTransition()
            fixture.at, fixture.actor, fixture.target, fixture.scope = self.f.at, sources.OFFICER_GUID, sources.GUID, c['scopeHash']
            page = fixture.page()
            page.update(realm=watcher.PRIME_REALM_LABEL, snapshotId=7)
            page['promotions'][0].update(name=sources.NAME)
            page['promotions'][0]['intent'].update(name=sources.NAME, originSnapshotId=7, lastSnapshotId=7)
            return True, dict(version=2, protocol=launch.DIRECTIVE_PROTOCOL, controlId=c['id'],
                actorGuid=c['guid'], coverageKind='selected-guids', targetGuids=c['targetGuids'],
                targetsDigest=launch.targets_digest276(c['targetGuids']), coveredGuids=c['targetGuids'], page=page)

        with patch.object(self.w.worker, 'call', side_effect=answer) as get:
            self.w.pull_launch_operations()
            self.assertEqual(get.call_count, 1)
        self.assertFalse(self.w.launch_selected.running)
        self.assertTrue(self.w.launch_selected.record['completed'])
        self.assertEqual(self.w.launch_selected.record['attempts'], 1)
        saved = watcher.savedvars.parse_file(self.w.launch_selected_file)['OlympusLaunchSelected']
        self.assertEqual(saved['page']['promotions'][0]['guid'], sources.GUID)
        self.assertTrue(saved['completed'])
        self.w.read_launch_control(self.f.db)
        self.assertFalse(self.w.launch_selected.running)
        self.assertEqual(self.w.launch_selected.record['attempts'], 1)

    def test_bound_selection_refuses_old_controls_unmarked_rosters_and_continuations(self):
        c = self.selected_initiates()
        self.assertEqual(self.w.valid_launch_control(self.f.db), c)
        for version, action, changes in [(4, 'select-directive', {}), (5, 'select-directive', {}),
                                        (5, launch.PRIME_INITIATE_ACTION, {'confirmations': '[{}]'}),
                                        (5, launch.PRIME_INITIATE_ACTION, {'targetGuids': [sources.OFFICER_GUID]})]:
            alternate = dict(c, version=version, action=action, **changes)
            alternate['mac'] = launch.selected_control_mac(sources.SECRET, alternate)
            self.assertIsNone(self.w.valid_launch_control(dict(self.f.db, launchControl=alternate)))
        older = dict(c, version=4, action='select-directive')
        c['mac'] = launch.selected_control_mac(sources.SECRET, older)
        self.assertIsNone(self.w.valid_launch_control(self.f.db))
        c['mac'] = launch.selected_control_mac(sources.SECRET, c)
        del self.roster['nativeScopeBinding']
        self.roster['nativeRealm'] = watcher.PRIME_REALM_LABEL
        self.assertIsNone(self.w.valid_launch_control(self.f.db))

    def test_bound_single_member_uses_own_signed_scope_and_only_current_native_ack(self):
        control = self.selected_initiates()
        scheme = watcher.native_rank_attestation.PROFILES[1]
        self.roster['nativeRankTable']['names'] = list(scheme['names'])
        self.roster['members'][1].update(rankIndex=8, rank='Member')
        self.roster['exportedAt'] -= 1
        control.update(version=6, action=launch.PRIME_MEMBER_ACTION)
        control['mac'] = launch.selected_control_mac(sources.SECRET, control)
        args = (sources.SECRET, control, self.f.at, sources.OFFICER_GUID, 'OLYMPUS PRIME', watcher.PRIME_REALM_LABEL)
        self.assertTrue(launch.validate_selected_control(*args, prime_binding=True))
        self.assertFalse(launch.validate_selected_control(*args, prime_binding=True, automatic_initiates=True))
        self.assertFalse(launch.validate_selected_control(*args, prime_binding=False))
        self.w.launch_selected_file.parent.mkdir(parents=True)
        self.f.write()
        self.w.check_savedvars()
        self.assertTrue(self.w.launch_selected.running)
        self.assertIsNone(self.w._launch_accepted_roster)

        def answer(method, path, retries):
            self.assertEqual((method, retries), ('GET', 1))
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(path).query)
            self.assertEqual(query['primeBinding'], ['prime-guild-master-member'])
            self.assertEqual(query['targetGuids'], ['["'+sources.GUID+'"]'])
            self.assertNotIn('autoInitiates', query)
            fixture = directive.DirectiveTransition()
            fixture.at, fixture.actor, fixture.target, fixture.scope = self.f.at, sources.OFFICER_GUID, sources.GUID, control['scopeHash']
            page = fixture.page()
            page.update(realm=watcher.PRIME_REALM_LABEL, snapshotId=7, rankProfile=scheme['profile'],
                        rankSchemeDigest=scheme['digest'], rankNames=list(scheme['names']))
            row = page['promotions'][0]
            row.update(name=sources.NAME, currentSlot=8, targetSlot=6, targetName='Veteran', reason='knight-veteran')
            row['intent'].update(name=sources.NAME, startSlot=8, finalSlot=6, reason='knight-veteran',
                                 originSnapshotId=7, lastSnapshotId=7, rankProfile=scheme['profile'], rankSchemeDigest=scheme['digest'])
            return True, dict(version=2, protocol=launch.DIRECTIVE_PROTOCOL, controlId=control['id'],
                              actorGuid=control['guid'], coverageKind='selected-guids', targetGuids=control['targetGuids'],
                              targetsDigest=launch.targets_digest276(control['targetGuids']), coveredGuids=control['targetGuids'], page=page)

        with patch.object(self.w.worker, 'call', side_effect=answer) as get:
            self.w.pull_launch_operations()
            self.assertEqual(get.call_count, 1)
        self.assertTrue(self.w.launch_selected.record['completed'])
        self.assertFalse(self.w.launch_selected.record['page']['actions']['automatic'])
        self.roster['members'][1].update(rankIndex=7, rank='Alt')
        ack = dict(self.w._verification_roster, digest=launch.roster_content_digest(self.roster))
        self.w.launch_selected.request(control, ack, self.roster, self.f.at)
        self.assertEqual(self.w.launch_selected.record['stoppedReason'], 'selected-target-unavailable')

    def test_selection_holds_when_original_ack_is_unknown(self):
        self.selected_initiates()
        self.f.unknown_roster = True
        self.f.write()
        self.w.check_savedvars()
        self.assertFalse(self.w.launch_selected.running)
        self.assertEqual(self.w.launch_selected.record['stoppedReason'], 'native-roster-receipt-required')
        self.assertEqual(self.w.launch_selected.record['attempts'], 0)
        self.assertIsNone(self.w._launch_accepted_roster)

    def test_selection_cannot_borrow_other_rank_or_changed_snapshot(self):
        self.selected_initiates()
        self.roster['members'][1].update(rankIndex=7, rank=self.roster['nativeRankTable']['names'][7])
        self.f.write()
        self.w.check_savedvars()
        self.assertFalse(self.w.launch_selected.running)
        self.assertEqual(self.w.launch_selected.record['stoppedReason'], 'selected-target-unavailable')
        self.assertEqual(self.w.launch_selected.record['attempts'], 0)

    def test_selected_read_rechecks_ack_immediately_before_request(self):
        self.selected_initiates()
        self.f.write()
        self.w.check_savedvars()
        self.assertTrue(self.w.launch_selected.running)
        self.w._verification_roster['snapshot'] += 1
        with patch.object(self.w.worker, 'call') as get:
            self.w.pull_launch_operations()
            get.assert_not_called()
        self.assertEqual(self.w.launch_selected.record['stoppedReason'], 'native-roster-changed-or-expired')

    def test_actual_file_wire_receipt_whisper_and_operator_holds(self):
        self.f.write()
        self.w.check_savedvars()
        [(method, path, body, retries)] = self.f.calls
        self.assertEqual((method, path), ('POST', '/ingest/roster'))
        self.assertEqual(body['nativeRealm'], '')
        self.assertEqual(body['nativeGuild'], 'OLYMPUS PRIME')
        self.assertEqual(body['nativeScopeBinding'], self.marker)
        self.assertEqual(body['nativeRosterTotal'], 2)
        self.assertEqual(body['nativeRankTable'], self.roster['nativeRankTable'])
        self.assertTrue(self.w.verification_roster_ready(self.f.body()))
        self.assertIsNone(watcher.launch_operations229.complete_roster_digest(self.roster))
        self.assertIsNone(self.w.valid_launch_control(dict(self.f.db, launchControl={'version': 1})))
        self.assertIsNone(self.w._launch_accepted_roster)
        with patch.object(watcher.officer_invites233, 'validate', return_value={'nativeInvite': {}}):
            self.assertFalse(self.w.officer_invite_roster_ready({}))
        self.w.handle_chat_line(self.f.line())
        self.assertEqual(len(self.f.verify_paths()), 1)

    def test_binding_does_not_borrow_unmarked_ack_or_same_second_watermark(self):
        del self.roster['nativeScopeBinding']
        self.roster['nativeRealm'] = watcher.PRIME_REALM_LABEL
        self.f.write()
        self.w.check_savedvars()
        unmarked = copy.deepcopy(self.w._verification_roster)
        scope = self.w.state.d['roster_scope_hash']
        payload = self.w.state.d['roster_payload_hash']
        self.assertTrue(self.w.verification_roster_ready(self.f.body()))
        self.assertNotIn('nativeRosterTotal', self.f.calls[0][2])
        self.assertEqual(self.f.calls[0][2]['nativeRealm'], watcher.PRIME_REALM_LABEL)
        self.roster['nativeScopeBinding'] = self.marker
        self.roster['nativeRealm'] = ''
        self.f.write()
        self.assertFalse(self.w.verification_roster_ready(self.f.body()))
        self.w.state.d['sv_mtime'] = 0
        self.w.check_savedvars()
        self.assertEqual(len(self.f.calls), 2)
        self.assertNotEqual(self.w._verification_roster['digest'], unmarked['digest'])
        self.assertEqual(self.w._verification_roster['scopeHash'], unmarked['scopeHash'])
        self.assertNotEqual(self.w.state.d['roster_scope_hash'], scope)
        self.assertNotEqual(self.w.state.d['roster_payload_hash'], payload)
        del self.roster['nativeScopeBinding']
        self.roster['nativeRealm'] = watcher.PRIME_REALM_LABEL
        self.f.write()
        self.assertFalse(self.w.verification_roster_ready(self.f.body()))

    def test_accented_name_survives_actual_utf8_file_wire_and_membership_proof(self):
        name = 'Ñò Example'
        self.f.write()
        path = self.w.sv_file
        path.write_text(path.read_text(encoding='utf-8').replace(sources.NAME, name), encoding='utf-8')
        self.w.check_savedvars()
        self.assertEqual(self.f.calls[0][2]['members'][1]['name'], name)
        with patch.object(sources, 'NAME', name):
            day = sources.codes.day_bucket(sources.datetime.fromtimestamp(self.f.at, sources.timezone.utc))
            self.f.code = sources.codes.code_for(sources.SECRET, name, day)
            self.assertTrue(self.w.verification_roster_ready(self.f.body()))
            self.w.handle_chat_line(self.f.line())
            [call] = self.f.verify_paths()
            self.assertEqual(call[2]['character'], name)

    def test_malformed_or_unenrolled_sources_are_held_before_http(self):
        def duplicate_member(roster):
            roster['members'][1]['guid'] = 'Player-1-ABCDEF12'
            roster['members'].append(dict(roster['members'][1], name='Another Member', guid='Player-1-abcdef12'))
            roster['total'] = len(roster['members'])

        cases = {
            'case-folded-duplicate-member': duplicate_member,
            'short-member-guid': lambda r: r['members'][1].update(guid='Player-1-ABCD'),
            'missing-member-guid': lambda r: r['members'][1].pop('guid'),
            'non-ascii-guid-realm': lambda r: r['members'][1].update(guid='Player-١-00000002'),
            'absent-marker-raw-blank': lambda r: (r.pop('nativeScopeBinding'), r.update(nativeRealm='')),
            'false-marker': lambda r: r.update(nativeScopeBinding=False),
            'missing-observer': lambda r: r['nativeScopeBinding'].pop('observerGuid'),
            'extra-marker-field': lambda r: r['nativeScopeBinding'].update(extra=True),
            'boolean-version': lambda r: r['nativeScopeBinding'].update(version=True),
            'another-kind': lambda r: r['nativeScopeBinding'].update(kind='guild-master'),
            'another-observer': lambda r: r['nativeScopeBinding'].update(observerGuid=sources.GUID),
            'unregistered-master': lambda r: (r['nativeScopeBinding'].update(observerGuid='Player-1-DEADBEEF'),
                                               r['members'][0].update(guid='Player-1-DEADBEEF')),
            'other-guild': lambda r: r.update(nativeGuild='Olympus Prime'),
            'other-realm': lambda r: r.update(nativeRealm='Another Realm'),
            'invented-native-label': lambda r: r.update(nativeRealm=watcher.PRIME_REALM_LABEL),
            'missing-native-realm': lambda r: r.pop('nativeRealm'),
            'absent-master': lambda r: r['members'][0].update(rankIndex=7, rank='Member'),
            'duplicate-master': lambda r: r['members'][1].update(rankIndex=0, rank='Guild Master'),
            'duplicate-observer': lambda r: r['members'][1].update(guid=sources.OFFICER_GUID),
            'wrong-row-rank': lambda r: r['members'][1].update(rank='Veteran'),
            'missing-ranks': lambda r: r.pop('nativeRankTable'),
            'unknown-ranks': lambda r: r['nativeRankTable']['names'].__setitem__(3, 'Unknown'),
            'truncated': lambda r: r.update(total=3),
            'expired': lambda r: r.update(exportedAt=self.f.at-601),
            'future': lambda r: r.update(exportedAt=self.f.at+1),
        }
        for label, alter in cases.items():
            with self.subTest(label=label):
                self.f.db['roster'] = copy.deepcopy(self.roster)
                alter(self.f.db['roster'])
                self.f.write()
                with self.assertRaises(watcher.SavedVariablesSourceUnavailable):
                    self.w.check_savedvars()
                self.assertFalse(self.f.calls)
                self.assertEqual(self.w.state.d['roster_sent'], 0)
                self.assertIsNone(self.w._verification_roster)

    def test_missing_file_or_other_logged_character_cannot_authorize_post(self):
        with self.assertRaises(watcher.SavedVariablesSourceUnavailable):
            self.w.forward_roster(self.roster)
        self.f.db['lastCharacterGuid'] = sources.GUID
        self.f.write()
        with self.assertRaises(watcher.SavedVariablesSourceUnavailable):
            self.w.check_savedvars()
        self.assertFalse(self.f.calls)

    def test_unknown_receipt_cannot_establish_witness_or_retry_on_replaced_source(self):
        self.f.unknown_roster = True
        self.f.write()
        self.w.check_savedvars()
        [item] = self.w.state.d['outbox']
        self.assertFalse(self.w.verification_roster_ready(self.f.body()))
        self.f.write(replace=True)
        self.assertIs(self.w._dispatch_original(item, retries=1), watcher.Delivery.HELD)
        self.assertEqual(len(self.f.calls), 1)
        self.assertIs(self.w.state.d['outbox'][0], item)

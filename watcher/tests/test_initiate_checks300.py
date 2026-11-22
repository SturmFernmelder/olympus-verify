"""Automatic Initiate pages use real SavedVariables, ACKs, and projection custody."""
import copy
import unittest
import urllib.parse
from unittest.mock import patch

import test_prime_realm_binding298 as prime
import test_directive_rank_transition as directives

watcher = prime.watcher
launch = prime.launch


class InitiateChecks300Tests(unittest.TestCase):
    def setUp(self):
        case = prime.PrimeRealmBinding298Tests()
        self.addCleanup(case.doCleanups)
        case.setUp()
        self.f, self.w, self.roster = case.f, case.w, case.roster
        self.at = self.f.at
        original = case.selected_initiates()
        del self.f.db['launchControl']
        self.w.initiate_checks_file.parent.mkdir(parents=True)
        self.roster['exportedAt'] -= 1
        self.targets = [original['targetGuids'][0], 'Player-1-0000CCCC']
        self.roster['members'].append(dict(self.roster['members'][1], name='Second Initiate', guid=self.targets[1]))
        self.roster['total'] += 1
        self.controls = [dict(original, id=f'{self.at}:{i+1}', targetGuids=[guid])
                         for i, guid in enumerate(self.targets)]
        self.resign()

    def resign(self):
        for c in self.controls:
            c['mac'] = launch.selected_control_mac(prime.sources.SECRET, c)
        self.f.db['primeInitiateChecks'] = dict(version=1, id=self.controls[0]['id'], controls=self.controls,
            mac=launch.sweep_mac(prime.sources.SECRET, self.controls[0]['id'], self.controls))

    def start(self):
        self.f.write()
        self.w.check_savedvars()

    def answer(self, method, path, retries=3):
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(path).query)
        self.assertEqual((method, retries, query['autoInitiates']), ('GET', 1, ['1']))
        control = next(c for c in self.controls if c['id'] == query['selectionId'][0])
        fixture = directives.DirectiveTransition()
        fixture.at, fixture.actor, fixture.target, fixture.scope = self.at, control['guid'], control['targetGuids'][0], control['scopeHash']
        page = fixture.page()
        snapshot, observed = int(query['snapshotId'][0]), int(query['snapshotAt'][0])
        page.update(realm=self.roster['nativeRealm'] or watcher.PRIME_REALM_LABEL, snapshotId=snapshot, snapshotAt=observed,
                    memberCount=self.roster['total'], fetchedAt=self.f.at)
        page['scan']['expiresAt'] = min(control['observedAt'], observed) + 600
        page['entitlements'].update(total=self.roster['total'], unscanned=self.roster['total']-1)
        page['promotions'][0]['intent'].update(originSnapshotId=snapshot, lastSnapshotId=snapshot,
            originSnapshotAt=observed, lastObservedAt=observed, issuedAt=self.f.at)
        return True, dict(version=2, protocol=launch.DIRECTIVE_PROTOCOL, controlId=control['id'],
            actorGuid=control['guid'], coverageKind='selected-guids', targetGuids=control['targetGuids'],
            targetsDigest=launch.targets_digest276(control['targetGuids']), coveredGuids=control['targetGuids'], page=page)

    def test_two_pages_retain_each_original_and_share_pacing(self):
        self.start()
        with patch.object(self.w.worker, 'call', side_effect=self.answer) as calls:
            self.w.pull_launch_operations()
            self.w.pull_launch_operations()
            self.assertEqual(calls.call_count, 1)
            self.f.at += 74  # The queued second automatic page still has the original roster window.
            self.w.pull_launch_operations()
            self.assertEqual(calls.call_count, 2)
        result = watcher.savedvars.parse_file(self.w.initiate_checks_file)['OlympusInitiateChecks']
        self.assertEqual(result['id'], self.controls[0]['id'])
        for guid, record in zip(self.targets, result['records'], strict=True):
            self.assertTrue(record['completed'])
            self.assertEqual((record['coveredGuids'], record['attempts']), ([guid], 1))
            self.assertFalse(record['page']['actions']['automatic'])
            self.assertNotIn('pageCursor', record['page'])
            self.assertEqual(record['expiresAt'], self.at+599)
        self.assertIsNone(self.w.launch_selected.record)
        self.assertFalse(self.w.launch_selected_file.exists())

    def test_sweep_signature_and_independent_unique_slots_mandatory(self):
        envelope = self.f.db['primeInitiateChecks']
        self.assertIs(self.w.valid_initiate_checks(self.f.db), envelope)
        for mutation in ('bad-mac', 'duplicate-id', 'duplicate-target', 'unsigned-page', 'reorder', 'oversize'):
            trial = copy.deepcopy(envelope)
            pages = trial['controls']
            if mutation == 'bad-mac':
                trial['mac'] = pages[0]['mac']
            elif mutation == 'duplicate-id':
                pages[1]['id'] = pages[0]['id']
            elif mutation == 'duplicate-target':
                pages[1]['targetGuids'] = pages[0]['targetGuids']
            elif mutation == 'unsigned-page':
                pages[1]['mac'] = 'f'*32
            elif mutation == 'reorder':
                pages.reverse()
            else:
                pages *= 26
            if mutation.startswith('duplicate'):
                pages[1]['mac'] = launch.selected_control_mac(prime.sources.SECRET, pages[1])
                trial['mac'] = launch.sweep_mac(prime.sources.SECRET, trial['id'], pages)
            self.assertIsNone(self.w.valid_initiate_checks(dict(self.f.db, primeInitiateChecks=trial)), mutation)
        self.assertIsNone(self.w.valid_initiate_checks(dict(self.f.db, primeInitiateChecks=self.controls[0])))

    def test_unknown_source_or_transport_cannot_retry_or_borrow(self):
        self.start()
        with patch.object(self.w.worker, 'call', return_value=(False, None)) as calls:
            self.w.pull_launch_operations()
            first, second = self.w.initiate_checks
            self.assertFalse(first.running)
            self.assertEqual(first.record['attempts'], 1)
            self.w._verification_roster['snapshot'] += 1
            self.f.at += 6
            self.w.pull_launch_operations()
            self.assertFalse(second.running)
            self.assertEqual(second.record['stoppedReason'], 'native-roster-changed-or-expired')
            self.w.read_initiate_checks(self.f.db, self.f.db['primeInitiateChecks'], self.w._sweep_witness)
            self.w.pull_launch_operations()
            self.assertEqual(calls.call_count, 1)

    def test_missing_ack_blocks_all_pages(self):
        self.f.unknown_roster = True
        self.start()
        self.assertTrue(all(p.record['stoppedReason'] == 'native-roster-receipt-required' for p in self.w.initiate_checks))
        self.assertTrue(all(not p.running for p in self.w.initiate_checks))

    def test_full_native_roster_fits_fifty_pages_and_never_extends_its_deadline(self):
        members = [self.roster['members'][0]]
        targets = []
        for i in range(999):
            guid = f'Player-2-{i:08X}'
            suffix = ''.join(chr(97+(i//power)%26) for power in (676, 26, 1))
            members.append(dict(self.roster['members'][1], name='Candidate '+suffix, guid=guid))
            targets.append(guid)
        self.roster.update(members=members, total=1000)
        original = self.controls[0]
        self.controls = [dict(original, id=f'{self.at}:{index+1}', targetGuids=targets[offset:offset+20])
                         for index, offset in enumerate(range(0, len(targets), 20))]
        self.resign()
        self.start()
        self.assertEqual(len(self.w.initiate_checks), 50)
        self.assertTrue(all(page.running for page in self.w.initiate_checks))
        self.assertIs(self.w.initiate_checks[0].native_guids, self.w.initiate_checks[-1].native_guids)
        self.f.at += 600
        with patch.object(self.w.worker, 'call') as calls:
            self.w.pull_launch_operations()
            calls.assert_not_called()
        self.assertTrue(all(not page.running and page.record['stoppedReason'] == 'scan-expired'
                            for page in self.w.initiate_checks))

    def test_file_change_during_read_drops_positive(self):
        self.start()
        def swap(method, path, retries):
            reply = self.answer(method, path, retries)
            self.f.db['lastCharacterGuid'] = self.targets[0]
            self.f.write(replace=True)
            return reply
        with patch.object(self.w.worker, 'call', side_effect=swap) as calls:
            self.w.pull_launch_operations()
            self.f.at += 6
            self.w.pull_launch_operations()
            self.assertEqual(calls.call_count, 1)
        self.assertFalse(self.w.initiate_checks[0].record['completed'])
        self.assertIsNone(self.w.initiate_checks[0].record['page'])

    def test_early_reload_between_pages_retains_original_evidence_and_completes(self):
        self.start()
        with patch.object(self.w.worker, 'call', side_effect=self.answer):
            self.w.pull_launch_operations()
        original = copy.deepcopy(self.w.initiate_checks[0].record)
        self.f.at += 78
        self.roster['exportedAt'] = self.f.at-1
        with patch.object(self.w.worker, 'call', return_value=(True, dict(trusted=True, snapshot=8, members=3))):
            self.start()
        self.assertEqual(self.w.initiate_checks[0].record, original)
        self.assertEqual(self.w.initiate_checks[1].record['snapshotId'], 8)
        with patch.object(self.w.worker, 'call', side_effect=self.answer) as calls:
            self.w.pull_launch_operations()
            self.assertEqual(calls.call_count, 1)
        saved = watcher.savedvars.parse_file(self.w.initiate_checks_file)['OlympusInitiateChecks']['records']
        self.assertEqual([(r['completed'], r['snapshotId'], r['snapshotAt'], r['attempts']) for r in saved],
                         [(True, 7, self.at-1, 1), (True, 8, self.f.at-1, 1)])

    def test_automatic_admission_window_is_limited_and_does_not_widen_manual_control(self):
        self.f.at += 555
        self.assertIsNotNone(self.w.valid_initiate_checks(self.f.db))
        c = self.controls[0]
        self.assertFalse(launch.validate_selected_control(prime.sources.SECRET, c, self.f.at, c['guid'],
            self.roster['nativeGuild'], watcher.PRIME_REALM_LABEL, prime_binding=True))
        self.f.at += 45
        self.assertIsNone(self.w.valid_initiate_checks(self.f.db))

    def test_zero_native_initiates_retires_old_results_on_disk(self):
        self.start()
        with patch.object(self.w.worker, 'call', side_effect=self.answer):
            self.w.pull_launch_operations()
        del self.f.db['primeInitiateChecks']
        self.f.at += 2
        self.roster['exportedAt'] = self.f.at
        ranks = self.roster['nativeRankTable']['names']
        for row in self.roster['members'][1:]:
            row.update(rankIndex=8, rank=ranks[8])
        self.start()
        result = watcher.savedvars.parse_file(self.w.initiate_checks_file)['OlympusInitiateChecks']
        self.assertEqual((result.get('id'), bool(result['records']), self.w.initiate_checks), (None, False, []))
        self.assertEqual((result['kind'], result['scopeHash'], result['snapshotId'], result['snapshotAt']),
                         ('no-native-initiates', self.controls[0]['scopeHash'], 7, self.f.at))
        with patch.object(self.w.worker, 'call') as calls:
            self.w.pull_launch_operations()
            calls.assert_not_called()

    def test_observed_realm_uses_v4_and_never_claims_blank_realm(self):
        del self.roster['nativeScopeBinding']
        self.roster['nativeRealm'] = watcher.PRIME_REALM_LABEL
        for c in self.controls:
            c.update(version=4, action='select-directive')
        self.resign()
        self.start()
        with patch.object(self.w.worker, 'call', side_effect=self.answer) as calls:
            self.w.pull_launch_operations()
        self.assertEqual(calls.call_count, 1)
        self.assertNotIn('primeBinding=', calls.call_args.args[1])
        self.assertTrue(self.w.initiate_checks[0].record['completed'])

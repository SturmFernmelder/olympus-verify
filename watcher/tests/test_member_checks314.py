"""Officer-selected Veteran reads across the real SavedVariables and projection boundary."""
import copy
import json
import unittest
import urllib.parse
from unittest.mock import patch

import test_directive_rank_transition as directive
import test_prime_realm_binding298 as prime

launch, watcher = prime.launch, prime.watcher


class MemberChecks314(unittest.TestCase):
    def setUp(self):
        fixture = prime.PrimeRealmBinding298Tests()
        self.addCleanup(fixture.doCleanups)
        fixture.setUp()
        self.f, self.w, self.roster = fixture.f, fixture.w, fixture.roster
        self.at = self.f.at
        control = fixture.selected_initiates()
        del self.f.db['launchControl']
        self.scheme = watcher.native_rank_attestation.PROFILES[1]
        self.roster['nativeRankTable']['names'] = list(self.scheme['names'])
        self.roster['exportedAt'] -= 1
        self.roster['members'][1].update(rankIndex=8, rank='Member')
        targets = [self.roster['members'][1]['guid']]
        for i in range(20):
            guid = f'Player-1-{3000+i:08X}'
            self.roster['members'].append(dict(self.roster['members'][1], name=f'Member {i}', guid=guid))
            targets.append(guid)
        self.roster['total'] = len(self.roster['members'])
        self.controls = [dict(control, version=7, action=launch.PRIME_MEMBERS_ACTION, id=f'{self.at}:{i+1}',
                              targetGuids=sorted(targets[i:i+20])) for i in range(0, len(targets), 20)]
        self.install(self.controls)
        self.w.member_checks_file.parent.mkdir(parents=True)

    def install(self, controls):
        for control in controls:
            control['mac'] = launch.selected_control_mac(prime.sources.SECRET, control)
        self.f.db['memberPromotionChecks'] = dict(version=1, id=controls[0]['id'], controls=controls,
            mac=launch.sweep_mac(prime.sources.SECRET, controls[0]['id'], controls, member_checks=True))

    def start(self):
        self.f.write()
        self.w.check_savedvars()

    def answer(self, method, path, retries, *, scheme=None):
        scheme = scheme or self.scheme
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(path).query)
        control = next(c for c in self.controls if c['id'] == query['selectionId'][0])
        self.assertEqual((method, retries, query['memberChecks']), ('GET', 1, ['1']))
        self.assertNotIn('autoInitiates', query)
        self.assertEqual(query.get('primeBinding'), {4:None, 6:['prime-guild-master-member'], 7:['prime-guild-master-members']}[control['version']])
        targets = json.loads(query['targetGuids'][0])
        self.assertEqual(targets, control['targetGuids'])
        issued, observed, snapshot = control['observedAt'], int(query['snapshotAt'][0]), int(query['snapshotId'][0])
        fixture = directive.DirectiveTransition()
        fixture.at, fixture.actor, fixture.target, fixture.scope = issued, control['guid'], targets[0], control['scopeHash']
        page = fixture.page()
        page.update(rankProfile=scheme['profile'], rankNames=list(scheme['names']), rankSchemeDigest=scheme['digest'],
                    realm=self.roster['nativeRealm'] or watcher.PRIME_REALM_LABEL, snapshotId=snapshot,
                    snapshotAt=observed, memberCount=self.roster['total'], fetchedAt=self.f.at)
        page['scan']['expiresAt'] = min(issued, observed)+600
        page['entitlements'].update(scanned=len(targets), total=self.roster['total'], unscanned=self.roster['total']-len(targets))
        template = page['promotions'][0]
        page['promotions'] = []
        for guid in targets:
            row = copy.deepcopy(template)
            row.update(guid=guid, targetName='Veteran', reason='knight-veteran', currentSlot=scheme['member'], targetSlot=scheme['veteran'])
            row['intent'].update(targetGuid=guid, rankProfile=scheme['profile'], rankSchemeDigest=scheme['digest'],
                startSlot=scheme['member'], finalSlot=scheme['veteran'], reason='knight-veteran', originSnapshotId=snapshot,
                lastSnapshotId=snapshot, originSnapshotAt=observed, lastObservedAt=observed, issuedAt=self.f.at)
            page['promotions'].append(row)
        return True, dict(version=2, protocol=launch.DIRECTIVE_PROTOCOL, controlId=control['id'], actorGuid=control['guid'],
            targetGuids=targets, coverageKind='selected-guids', targetsDigest=launch.targets_digest276(targets), coveredGuids=targets, page=page)

    def test_all_twenty_one_processed_with_original_clocks_and_private_worker_scope(self):
        self.start()
        self.assertFalse(self.w.initiate_checks)
        self.assertIsNone(self.w.launch_selected.record)
        with patch.object(self.w.worker, 'call', side_effect=self.answer) as http:
            self.w.pull_launch_operations()
            self.w.pull_launch_operations()
            self.assertEqual(http.call_count, 1)
            self.f.at += 75
            self.w.pull_launch_operations()
            self.assertEqual(http.call_count, 2)
        records = watcher.savedvars.parse_file(self.w.member_checks_file)['OlympusMemberChecks']['records']
        self.assertEqual([r['coveredGuids'] for r in records], [c['targetGuids'] for c in self.controls])
        self.assertTrue(all(r['completed'] and r['attempts']==1 and r['expiresAt']==self.at+599 for r in records))
        self.assertTrue(all('pageCursor' not in r['page'] for r in records))
        self.assertFalse(self.w.launch_selected_file.exists())

    def test_bad_or_repurposed_control_is_not_sent(self):
        original = self.f.db['memberPromotionChecks']
        self.assertTrue(self.w.valid_initiate_checks(self.f.db, member_checks=True))
        self.assertIsNone(self.w.valid_initiate_checks(dict(self.f.db, primeInitiateChecks=original)))
        self.assertIsNone(self.w.valid_launch_control(dict(self.f.db, launchControl=self.controls[0])))
        for mutate in (lambda p: p[1].update(id=p[0]['id']), lambda p: p[1].update(targetGuids=p[0]['targetGuids'][:1]),
                       lambda p: p[0].update(version=5, action=launch.PRIME_INITIATE_ACTION),
                       lambda p: p[1].update(version=6, action=launch.PRIME_MEMBER_ACTION),
                       lambda p: p[1].update(confirmations=' [ ] ')):
            controls = copy.deepcopy(self.controls)
            mutate(controls)
            self.install(controls)
            self.assertIsNone(self.w.valid_initiate_checks(self.f.db, member_checks=True))
        self.f.db['memberPromotionChecks'] = dict(original, mac='0'*32)
        self.assertIsNone(self.w.valid_initiate_checks(self.f.db, member_checks=True))

    def test_uncertain_read_never_replayed_and_remaining_pages_hold_at_expiry(self):
        self.start()
        with patch.object(self.w.worker, 'call', side_effect=OSError()) as http:
            self.w.pull_launch_operations()
            self.assertEqual(self.w.member_checks[0].record['stoppedReason'], 'source-unknown')
            self.assertTrue(self.w.state.was_seen(self.w.member_checks[0].custody_key))
            self.f.at += 600
            self.w.pull_launch_operations()
            self.assertEqual(http.call_count, 1)
        records = watcher.savedvars.parse_file(self.w.member_checks_file)['OlympusMemberChecks']['records']
        self.assertEqual([r['stoppedReason'] for r in records], ['source-unknown', 'scan-expired'])
        self.assertEqual([r['attempts'] for r in records], [1, 0])

    def test_named_realm_directive_starts_at_member_seven(self):
        fixture = directive.DirectiveTransition()
        fixture.setUp()
        fixture.at = self.at
        roster, c = fixture.roster, fixture.control()
        roster.update(exportedAt=self.at-1)
        roster['members'][1].update(rankIndex=7, rank='Member')
        self.controls, self.roster = [c], roster
        read = launch.SelectedRead(lambda: self.f.at, member_checks=True)
        read.request(c, dict(exportedAt=roster['exportedAt'], snapshot=12, digest=launch.complete_roster_digest(roster)), roster, self.at)
        self.assertTrue(read.running)
        scheme = watcher.native_rank_attestation.PROFILES[0]
        read.step(lambda *args, **kwargs: self.answer(*args, **kwargs, scheme=scheme), self.at)
        self.assertTrue(read.record['completed'])
        self.assertEqual(read.record['page']['promotions'][0]['targetSlot'], 5)

    def test_clear_private_projection_after_request_disappears(self):
        self.start()
        del self.f.db['memberPromotionChecks']
        self.f.at += 1
        self.start()
        self.assertEqual(self.w.member_checks_file.read_text().strip(), 'OlympusMemberChecks=nil')
        self.assertFalse(self.w.member_checks)

    def test_a_thousand_distinct_requests_supported_and_oversize_rejected(self):
        targets = [f'Player-1-{i+3000:08X}' for i in range(1001)]
        controls = []
        for offset in range(0, 1000, 20):
            controls.append(dict(self.controls[0], id=f'{self.at}:{offset+1}', targetGuids=targets[offset:offset+20]))
        self.install(controls)
        self.assertTrue(self.w.valid_initiate_checks(self.f.db, member_checks=True))
        controls.append(dict(controls[0], id=f'{self.at}:1001', targetGuids=targets[1000:]))
        self.install(controls)
        self.assertIsNone(self.w.valid_initiate_checks(self.f.db, member_checks=True))

    def test_more_than_twenty_owned_continuations_and_nonmatching_step(self):
        controls = []
        for i, row in enumerate(self.roster['members'][1:]):
            row.update(rank=self.scheme['names'][7], rankIndex=7)
            step = dict(guid=row['guid'], token='a.'+'b'*64, observedAt=self.at-1)
            step.update({'from': 8, 'to': 7})
            controls.append(dict(self.controls[0], version=6, action=launch.PRIME_MEMBER_ACTION, id=f'{self.at}:{i+1}',
                                 targetGuids=[row['guid']], confirmations=json.dumps([step], separators=(',', ':'))))
        self.install(controls)
        self.roster['members'][1].update(rank='Veteran', rankIndex=6)
        self.start()
        self.assertEqual(len(self.w.member_checks), 21)
        self.assertEqual(self.w.member_checks[0].record['stoppedReason'], 'selected-target-unavailable')
        self.assertTrue(all(read.running for read in self.w.member_checks[1:]))
        with patch.object(self.w.worker, 'call', return_value=(False, {'httpStatus':429,'retryAfterSeconds':11})) as send:
            self.w.pull_launch_operations()
        params = urllib.parse.parse_qs(urllib.parse.urlsplit(send.call_args.args[1]).query)
        self.assertEqual(params['primeBinding'], ['prime-guild-master-member'])
        self.assertEqual(params['confirmations'], [controls[1]['confirmations']])
        self.assertNotIn('autoInitiates', params)

    def test_changed_source_during_transport_drops_positive(self):
        self.start()
        def swap(*args, **kwargs):
            result = self.answer(*args, **kwargs)
            self.f.db['lastCharacterGuid'] = self.controls[0]['targetGuids'][0]
            self.f.write(replace=True)
            return result
        with patch.object(self.w.worker, 'call', side_effect=swap) as http:
            self.w.pull_launch_operations()
            self.f.at += 5
            self.w.pull_launch_operations()
            self.assertEqual(http.call_count, 1)
        self.assertFalse(self.w.member_checks[0].record['completed'])
        self.assertIsNone(self.w.member_checks[0].record['page'])

    def test_delayed_positive_roster_ack_continues_only_same_export(self):
        self.start()
        witness = self.w._member_checks_witness
        accepted = self.w._verification_roster
        self.w._verification_roster = self.w._member_checks_mac = None
        self.w.read_member_checks(self.f.db, self.f.db['memberPromotionChecks'], witness)
        self.assertTrue(self.w._member_waiting)
        self.assertFalse(any(page.running for page in self.w.member_checks))
        self.w._verification_roster = accepted
        with patch.object(self.w.worker, 'call', side_effect=self.answer):
            self.w.pull_launch_operations()
        self.assertFalse(self.w._member_waiting)
        self.assertTrue(self.w.member_checks[0].record['completed'])

    def test_new_process_preserves_completed_display_and_marks_interrupted_pages_without_resending(self):
        self.start()
        with patch.object(self.w.worker, 'call', side_effect=self.answer):
            self.w.pull_launch_operations()
        before = watcher.savedvars.parse_file(self.w.member_checks_file)['OlympusMemberChecks']['records']
        self.assertTrue(before[0]['completed'] and before[1]['running'])
        restarted = watcher.Watcher(self.w.cfg)
        with patch.object(restarted.worker, 'call', side_effect=AssertionError('No transport on replay')) as http:
            restarted.check_savedvars()
            restarted.pull_launch_operations()
            self.assertEqual(http.call_count, 0)
        after = watcher.savedvars.parse_file(self.w.member_checks_file)['OlympusMemberChecks']['records']
        self.assertEqual(after[0], before[0])
        self.assertFalse(after[1]['running'])
        self.assertEqual(after[1]['stoppedReason'], 'native-roster-receipt-required')
        self.assertIsNone(restarted._verification_roster)

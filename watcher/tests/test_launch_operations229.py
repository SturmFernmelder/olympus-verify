""".229 sidecar admission/pagination/custody, synthetic transport only."""
import copy
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import launch_operations229 as launch
import watcher
from native_rank_schemes import NAMES, NATIVE_PROFILE, SCHEME_DIGEST


def page(at, offset=0, total=20, started=None):
    started = at if started is None else started
    guild, realm, short = 'OLYMPUS PRIME', 'Native Realm', 'Guild rules and Discord: use Get my code, then follow the bot instructions.'
    last = offset + 20 >= total
    return dict(protocol=launch.PROTOCOL, fetchedAt=at, expiresAt=at + 60, status='ready' if last else 'partial',
                snapshotId=12, snapshotAt=started - 10, memberCount=total, guild=guild, canonicalGuild=guild, realm=realm,
                rankProfile=NATIVE_PROFILE, rankSchemeDigest=SCHEME_DIGEST, rankNames=list(NAMES),
                scan=dict(id='a'*32, startedAt=started, expiresAt=started+590), pageCursor='page-'+str(offset),
                scopeHash=hashlib.sha256(f'native-scope|1|{guild}|{realm}'.encode()).hexdigest()[:16],
                entitlements=dict(offset=offset, pageSize=20, scanned=min(20,max(0,total-offset)), total=total, unscanned=max(0, total-offset-20), retryAfterSeconds=None),
                nextCursor=None if last else 'opaque-cursor-' + str(offset + 20), invites=[],
                promotions=[dict(guid=f'Player-1-{offset+1:08X}', name='Test Member', currentSlot=9, targetSlot=7, targetName="Member", reason='verified-initiate')],
                riskBuffer=[], held=[], heldReasons=['native-unguilded-proof-required'],
                motd=dict(short=short, bulletin='Long bulletin\nSecond line', characters=len(short), bytes=len(short.encode()), maxBytes=128),
                actions=dict(automatic=False, roleGrants=False, removals=False, requiresNativeRecheck=True))


class LaunchOperations(unittest.TestCase):
    def setUp(self):
        self.at = int(time.time())

    def test_canonical_aliases_preserve_raw_scope(self):
        for name in ('OLYMPUS PRIME', 'Olympus', 'Olympus I'):
            self.assertEqual(launch.canonical_guild(name), 'OLYMPUS PRIME')
        for name in ('Olympus II', 'Olympus X'):
            self.assertEqual(launch.canonical_guild(name), name)
        for name in ('OLYMPUSPRIME', 'Olympus Prime Impostors', 'Anti Olympus', None, 2):
            self.assertIsNone(launch.canonical_guild(name))
        value = page(self.at)
        self.assertTrue(launch.validate_page(value, self.at))
        value['guild'] = 'Olympus I'  # Affiliation alias does not rewrite the raw scope hash.
        self.assertFalse(launch.validate_page(value, self.at))
        value['scopeHash'] = hashlib.sha256(f"native-scope|1|{value['guild']}|{value['realm']}".encode()).hexdigest()[:16]
        self.assertTrue(launch.validate_page(value, self.at))

    def test_expiry_scope_and_authority_negatives(self):
        changes = [lambda p: p.update(expiresAt=self.at), lambda p: p.update(fetchedAt=self.at+6, expiresAt=self.at+66),
                   lambda p: p.update(snapshotAt=self.at-3601), lambda p: p.update(scopeHash='0'*16),
                   lambda p: p['actions'].update(automatic=True), lambda p: p['actions'].update(roleGrants=True),
                   lambda p: p.update(invites=[{'name': 'Unknown Guild'}]), lambda p: p.update(status=[]),
                   lambda p: p['promotions'][0].update(targetSlot=0), lambda p: p['promotions'][0].update(targetSlot=5),
                   lambda p: p['promotions'][0].update(currentSlot=True), lambda p: p['motd'].update(short='x'*129),
                   lambda p: p['motd'].update(bytes=999), lambda p: p.update(nextCursor='a\nsecret')]
        for change in changes:
            with self.subTest(change=change):
                value = page(self.at); change(value)
                self.assertFalse(launch.validate_page(value, self.at))

    def test_officer234_target_contract_and_old_wire_refusal(self):
        value = page(self.at)
        self.assertEqual((launch.PROTOCOL, launch.PATH), ('officer-operations-v234', '/queue/launch-operations?keyVersion=officer-operations-v234'))
        self.assertTrue(launch.validate_page(value, self.at))
        for patch_value in [dict(targetSlot=8), dict(targetSlot=5), dict(targetName='Veteran'), dict(currentSlot=8)]:
            changed = copy.deepcopy(value); changed['promotions'][0].update(patch_value)
            self.assertFalse(launch.validate_page(changed, self.at))
        value['protocol'] = 'launch-operations-v1'
        self.assertFalse(launch.validate_page(value, self.at))
        value = page(self.at); value['promotions'][0].update(targetSlot=5, targetName='Veteran', reason='knight-veteran', currentSlot=7)
        self.assertTrue(launch.validate_page(value, self.at))
        value['promotions'][0]['currentSlot'] = 5
        self.assertFalse(launch.validate_page(value, self.at))

    def scan(self, total=20):
        self.clock = float(self.at)
        scan = launch.Scan(lambda: self.clock)
        self.assertTrue(scan.request(dict(action='scan', id=str(self.at)+':1', scopeHash=page(self.at)['scopeHash']), self.clock))
        calls = []
        def call(method, path, retries):
            self.assertEqual(method, 'GET'); self.assertEqual(retries, 1)
            calls.append(path)
            offset = int(path.rsplit('-', 1)[1]) if '&cursor=' in path else 0
            return True, page(int(self.clock), offset, total, self.at)
        return scan, call, calls

    def test_officer233_bounded_invite_projection_and_stale_advisory(self):
        value = page(self.at)
        row = dict(queueId=1, proofId='1'*32, name='Visible Candidate', guid='Player-1-ABCDEF12', fullName='Visible Candidate',
                   scopeHash=value['scopeHash'], observedAt=self.at, expiresAt=self.at+60, reason='knight-unguilded', source='native-who-unit-v233')
        value['invites'] = [row]
        self.assertTrue(launch.validate_page(value, self.at))
        self.assertFalse(launch.validate_page(value, self.at+60))
        self.assertTrue(launch.validate_page(value, self.at+60, allow_stale=True))
        for changes in (dict(queueId=True), dict(source='membership-absence'), dict(expiresAt=self.at+61), dict(fullName='Other'), dict(scopeHash='0'*16), dict(reason='manual')):
            changed = copy.deepcopy(value); changed['invites'][0].update(changes)
            self.assertFalse(launch.validate_page(changed, self.at), changes)
        duplicate = copy.deepcopy(value); duplicate['held'] = [dict(name=row['name'], guid=row['guid'], reason='held')]
        self.assertFalse(launch.validate_page(duplicate, self.at))
        later = page(self.at, 20, 40); later['invites'] = [row]
        self.assertFalse(launch.validate_page(later, self.at))
        value['invites'] *= 4
        self.assertFalse(launch.validate_page(value, self.at))

    def test_full_1000_scan_50_pages_plus_fifty_explicit_refresh_attempts(self):
        scan, call, calls = self.scan(1000)
        self.assertTrue(scan.step(call, self.clock))
        self.assertFalse(scan.step(call, self.clock+1))
        for _ in range(49):
            self.clock += 5
            self.assertTrue(scan.step(call, self.clock))
        self.assertEqual((len(calls), len(scan.pages), scan.refreshed, scan.complete, scan.phase), (50, 50, 0, True, 'idle'))
        self.assertFalse(scan.step(call, self.clock+5))  # discovery never allocates automatic refreshes
        original_scan = copy.deepcopy(scan.pages[0]['scan'])
        self.assertLess(scan.pages[0]['expiresAt'], self.clock)
        for index in range(50):
            self.clock += 5
            self.assertTrue(scan.request(dict(action='recheck',offset=index*20,id=str(index),scopeHash=page(self.at)['scopeHash']),self.clock))
            self.assertTrue(scan.step(call,self.clock))
            self.assertEqual(scan.pages[index*20]['scan'],original_scan)
        self.assertEqual((len(calls),scan.refreshed,scan.calls),(100,50,100))
        self.assertFalse(scan.request(dict(action='recheck',offset=0,id='exhausted',scopeHash=page(self.at)['scopeHash']),self.clock+5))
        self.assertLess(self.clock-self.at, 600)
        self.assertLess(scan.pages[0]['fetchedAt'], scan.pages[980]['fetchedAt'])
        self.assertLess(scan.pages[60]['expiresAt'], self.clock)  # retained advisory, never renewed by other pages
        body = launch.render_pages(scan.result(), int(self.clock))
        self.assertIn('OlympusLaunchQueue=', body)
        self.assertNotIn('OlympusQueue=', body)
        self.assertNotIn('pageCursor', body)
        self.assertNotIn('nextCursor', body)
        self.assertIn('bulletin="Long bulletin\\nSecond line"', body)
        self.assertFalse(scan.step(call, self.clock+601))

    def test_one_second_page_difference_and_recheck_within_original_scan(self):
        first, second = page(self.at, 0, 40), page(self.at+1, 20, 40, self.at)
        self.assertTrue(launch.validate_page(second, self.at+1))
        result = dict(version=3, controlId='x', scanComplete=True, running=False, stoppedReason=None, discoveredPages=2, refreshedPages=0, pages=[first, second])
        self.assertIsNotNone(launch.render_pages(result, self.at+61))
        scan, call, calls = self.scan(40)
        for _ in range(4):
            scan.step(call, self.clock); self.clock += 5
        self.clock = self.at+100
        self.assertTrue(scan.request(dict(action='recheck', offset=20, id='next', scopeHash=second['scopeHash']), self.clock))
        scan.step(call, self.clock)
        self.assertEqual(scan.pages[20]['fetchedAt'], self.at+100)
        self.assertEqual(scan.pages[20]['scan'], first['scan'])
        self.assertFalse(scan.request(dict(action='recheck', offset=20, id='late', scopeHash=second['scopeHash']), self.at+590))

    def test_mixed_or_duplicate_pages_hold(self):
        for alter in (lambda p: p.update(snapshotId=13), lambda p: p['scan'].update(id='b'*32),
                      lambda p: p.update(guild='Olympus I'), lambda p: p['promotions'][0].update(guid='Player-1-00000001'),
                      lambda p: p['entitlements'].update(offset=0)):
            scan, call, calls = self.scan(40)
            scan.step(call, self.clock); self.clock += 5
            value = page(int(self.clock), 20, 40, self.at); alter(value)
            scan.step(lambda *a, **k: (True, value), self.clock)
            self.assertEqual(scan.phase, 'idle'); self.assertIsNotNone(scan.stopped)
            self.assertFalse(scan.complete)

    def test_transport_refusal_is_not_an_empty_current_queue(self):
        scan, call, calls = self.scan()
        scan.step(lambda *a, **k: (False, {'httpStatus': 429, 'retryAfterSeconds': 60}), self.clock)
        self.assertEqual(scan.stopped, 'source-refused')
        self.assertFalse(scan.step(call, self.clock+60))
        self.assertIsNone(launch.render_pages(None, self.at))
        self.assertIsNone(launch.render_pages([page(self.at)], self.at+60))

    def test_watcher_writes_only_separate_projection_and_keeps_legacy_custody(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            instance = watcher.Watcher(dict(wow_dir=str(root), account='synthetic', worker_url='https://test.invalid', watcher_token='synthetic-token',
                                           verify_secret='synthetic-secret', officer_character='Fern Melder', membership_only=True, state_file=str(root/'state.json')))
            instance.queue_file.parent.mkdir(parents=True)
            instance.queue_file.write_text('LEGACY UNCHANGED')
            calls = []
            def call(method,path,body=None,retries=3):
                if method == 'POST': return True,dict(snapshot=12,members=len(body['members']),trusted=True)
                calls.append((method,path,body));return True,dict(page(self.at),protocol='officer-operations-v235')
            instance.worker.call = call
            instance.pull_launch_operations()
            self.assertEqual(calls, [])  # no explicit request, no role fetch
            control = dict(version=1, action='scan', id=str(self.at)+':1', observedAt=self.at, scopeHash=page(self.at)['scopeHash'], guid='Player-1-0000AAAA', offset=0)
            control['mac'] = launch.control_mac('synthetic-secret', control)
            db = dict(lastCharacterGuid=control['guid'], launchControl=control,
                      roster=dict(exportedAt=self.at-10,total=20,nativeGuild='OLYMPUS PRIME',nativeRealm='Native Realm',
                                  members=[dict(guid=control['guid'] if i==0 else f'Player-1-{i:08X}',name='Fern Melder' if i==0 else 'Member '+str(i),rank='Member',rankIndex=7,level=60) for i in range(20)]))
            instance.sv_file.parent.mkdir(parents=True, exist_ok=True)
            instance.sv_file.write_text('OlympusVerifyDB = ' + launch._lua(db), encoding='utf-8')
            with patch.object(watcher.time, 'sleep'):
                instance.check_savedvars()
            instance.pull_launch_operations()
            self.assertEqual((len(calls), len(instance.launch_scan.pages)), (1, 1))
            before = instance.launch_operations_file.read_bytes()
            self.assertIn(b'OlympusLaunchQueue=', before)
            self.assertEqual(instance.queue_file.read_text(), 'LEGACY UNCHANGED')
            self.assertTrue(all(method == 'GET' and path == launch.DISCOVERY_PATH235 and body is None for method, path, body in calls))
            count = len(calls)
            instance.pull_launch_operations()
            self.assertEqual(len(calls), count)  # No role request on the normal fast loop.
            instance.worker.call = lambda *a, **k: (False, {'httpStatus': 429})
            ready_at = max(self.at+6, instance.launch_scan.next_at+1)
            with patch.object(watcher.time,'time',return_value=ready_at):
                self.assertTrue(instance.launch_scan.request(dict(action='recheck',offset=0,id='explicit-refusal',scopeHash=page(self.at)['scopeHash']),ready_at))
                instance.pull_launch_operations()
            self.assertIn(b'stoppedReason="source-refused"', instance.launch_operations_file.read_bytes())
            self.assertFalse(instance.state.d.get('queue_written_pending'))
            self.assertEqual(instance.queue_file.read_text(), 'LEGACY UNCHANGED')
            self.assertEqual(instance.launch_scan.calls, 2)
            self.assertEqual(instance.launch_scan.refreshed, 1)  # the explicit 429 attempt remains spent
            instance.read_launch_control(db)  # saved replay does not restart
            self.assertEqual(instance.launch_scan.calls, 2)

    def test_explicit_same_page_attempts_are_cumulative_and_paced_across_controls(self):
        scan, call, calls = self.scan(80)
        for _ in range(4):
            scan.step(call,self.clock);self.clock+=5
        self.assertEqual((len(calls),scan.refreshed),(4,0))
        self.clock=self.at+16
        scope=page(self.at)['scopeHash']
        self.assertTrue(scan.request(dict(action='recheck',offset=60,id='late-row',scopeHash=scope),self.clock))
        self.assertFalse(scan.step(call,self.clock));self.assertEqual(len(calls),4)
        self.clock=self.at+20;self.assertTrue(scan.step(call,self.clock))
        self.assertTrue(calls[-1].endswith('page-60'));self.assertEqual(scan.refreshed,1)
        self.clock+=1
        self.assertTrue(scan.request(dict(action='recheck',offset=60,id='same-page-again',scopeHash=scope),self.clock))
        self.assertFalse(scan.step(call,self.clock));self.assertEqual(scan.refreshed,1)
        self.clock=self.at+25;self.assertTrue(scan.step(call,self.clock));self.assertEqual((scan.calls,scan.refreshed),(6,2))
        self.clock+=1
        self.assertTrue(scan.request(dict(action='recheck',offset=0,id='unknown',scopeHash=scope),self.clock))
        self.assertFalse(scan.step(call,self.clock))
        self.clock=self.at+30
        def unknown(*args,**kwargs): raise OSError('synthetic transport outcome')
        self.assertTrue(scan.step(unknown,self.clock))
        self.assertEqual((scan.calls,scan.refreshed,scan.stopped),(7,3,'source-unknown'))
        self.assertFalse(scan.step(call,self.clock+5))
        self.assertFalse(scan.request(dict(action='recheck',offset=60,id='retry-unknown',scopeHash=scope),self.clock+5))

    def test_local_control_scope_mac_expiry_stop_and_scan_expiry(self):
        value = dict(version=1, action='scan', id=str(self.at)+':1', observedAt=self.at, scopeHash=page(self.at)['scopeHash'], guid='Player-1-0000AAAA', offset=0)
        value['mac'] = launch.control_mac('synthetic-secret', value)
        args = ('synthetic-secret', value, self.at, value['guid'], 'OLYMPUS PRIME', 'Native Realm')
        self.assertTrue(launch.validate_control(*args))
        for key, bad in [('action','recheck'), ('guid','Player-1-0000BBBB'), ('offset',20), ('mac','0'*32), ('observedAt',self.at-61)]:
            changed = dict(value); changed[key] = bad
            self.assertFalse(launch.validate_control(args[0], changed, *args[2:]))
        scan, call, calls = self.scan(1000)
        scan.step(call, self.clock)
        self.assertTrue(scan.request(dict(action='stop', id='stop'), self.clock))
        self.assertFalse(scan.step(call, self.clock+5)); self.assertFalse(scan.complete)
        self.assertEqual(scan.stopped, 'operator-stopped')
        scan, call, calls = self.scan(1000); scan.step(call, self.clock)
        self.clock = self.at+590; scan.step(call, self.clock)
        self.assertEqual(scan.stopped, 'scan-expired'); self.assertEqual(len(calls), 1)

    def test_actual_savedvars_ingestion_order_reload_recheck_and_changed_rows(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            instance = watcher.Watcher(dict(wow_dir=str(root), account='synthetic', worker_url='https://test.invalid', watcher_token='synthetic-token',
                                           verify_secret='synthetic-secret', officer_character='Fern Melder', membership_only=True, state_file=str(root/'state.json')))
            instance.queue_file.parent.mkdir(parents=True)
            instance.sv_file.parent.mkdir(parents=True, exist_ok=True); instance.sv_file.write_text('synthetic')
            self.clock = float(self.at)
            roster = dict(exportedAt=self.at-10, total=20, online=1, nativeGuild='OLYMPUS PRIME', nativeRealm='Native Realm',
                          members=[dict(name='Fern Melder' if i == 0 else 'Member '+str(i), full='Full '+str(i), guid='Player-1-0000AAAA' if i == 0 else f'Player-1-{i:08X}',
                                        rank='High Council' if i == 0 else 'Initiate', rankIndex=1 if i == 0 else 9, level=60, lastOnline=0, note='', onote='', **{'class':'MAGE'}) for i in range(20)])
            db = dict(lastCharacterGuid='Player-1-0000AAAA', roster=roster)
            def check_source():
                instance.sv_file.write_text('OlympusVerifyDB=' + launch._lua(db), encoding='utf-8')
                instance.check_savedvars()
            def control(action, sequence):
                c = dict(version=1, action=action, id=str(int(self.clock))+':'+str(sequence), observedAt=int(self.clock), scopeHash=page(self.at)['scopeHash'], guid=db['lastCharacterGuid'], offset=0)
                c['mac'] = launch.control_mac('synthetic-secret', c); db['launchControl'] = c
            calls = []
            def call(method, path, body=None, retries=3):
                calls.append((method,path,body))
                if method == 'POST': return True, dict(snapshot=12, members=len(body['members']), trusted=True)
                return True, dict(page(int(self.clock), started=self.at),protocol='officer-operations-v235')
            instance.worker.call = call
            control('scan',1)
            with patch.object(watcher.time,'time',lambda:self.clock), patch.object(watcher.time,'sleep'):
                check_source(); instance.pull_launch_operations()
                self.clock += 5; instance.pull_launch_operations()
                self.assertEqual(instance.launch_scan.phase,'idle')
                original_at = instance.state.d['roster_sent']
                original_scan = copy.deepcopy(instance.launch_scan.pages[0]['scan'])
                self.clock += 1; roster['exportedAt'] = int(self.clock); control('recheck',2)
                instance.state.d['sv_mtime'] = 0
                check_source(); instance.pull_launch_operations()
                self.assertEqual(sum(m=='POST' for m,p,b in calls),1)
                self.assertEqual(instance.state.d['roster_sent'],original_at)
                self.assertEqual(instance.launch_scan.pages[0]['scan'],original_scan)
                self.assertEqual(instance.launch_scan.pages[0]['fetchedAt'],int(self.clock))
                self.assertEqual(instance.launch_scan.control_id,db['launchControl']['id'])
                roster['members'][1]['level'] = 59; roster['exportedAt'] = original_at
                instance.state.d['sv_mtime'] = 0; check_source()
                self.assertEqual(sum(m=='POST' for m,p,b in calls),2)  # Changed same-second contents enter a distinct original; the clock is not manufactured.
                self.assertEqual([b['exportedAt'] for m,p,b in calls if m=='POST'], [original_at, original_at])
                self.assertEqual(instance.launch_scan.stopped,'native-roster-changed-or-expired')
                self.assertIn(b'stoppedReason="native-roster-changed-or-expired"',instance.launch_operations_file.read_bytes())
                roster['exportedAt'] = int(self.clock)+1; self.clock += 1
                instance.state.d['sv_mtime'] = 0; check_source()
                self.assertEqual(sum(m=='POST' for m,p,b in calls),3)
                self.assertEqual(instance.launch_scan.stopped,'native-roster-changed-or-expired')

    def test_only_same_process_positive_complete_receipt_can_coalesce(self):
        roster = dict(exportedAt=self.at,total=1,nativeGuild='OLYMPUS PRIME',nativeRealm='Native Realm',members=[dict(name='Fern Melder',guid='Player-1-0000AAAA',rank='High Council',rankIndex=1,level=60)])
        digest = launch.complete_roster_digest(roster)
        self.assertIsNotNone(digest)
        newer = copy.deepcopy(roster); newer['exportedAt'] += 1
        self.assertEqual(launch.complete_roster_digest(newer),digest)
        for alter in (lambda r:r.update(total=2), lambda r:r['members'][0].update(rankIndex=None), lambda r:r.update(nativeGuild='OLYMPUSPRIME')):
            changed = copy.deepcopy(roster); alter(changed); self.assertIsNone(launch.complete_roster_digest(changed))
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            instance = watcher.Watcher(dict(wow_dir=str(root),account='synthetic',worker_url='https://test.invalid',watcher_token='synthetic-token',verify_secret='synthetic-secret',officer_character='Fern Melder',membership_only=True,state_file=str(root/'state.json')))
            for response in (dict(trusted=False,snapshot=12,members=1),dict(skipped=True,trusted=True,snapshot=12,members=1),dict(refused='x',trusted=True,snapshot=12,members=1),dict(trusted=True,snapshot=12,members=2)):
                instance._launch_roster_candidate = dict(body={'members':[{}]},digest=digest,exportedAt=self.at)
                instance.note_launch_roster_receipt(dict(path='/ingest/roster',body={'members':[{}]}),response)
                self.assertIsNone(instance._launch_accepted_roster)
            self.assertNotIn('launch_accepted_roster',instance.state.d)

    def test_exhausted_scan_requires_fresh_unseen_control_and_accepted_new_native_export(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            w=watcher.Watcher(dict(wow_dir=str(root),account='synthetic',worker_url='https://test.invalid',watcher_token='synthetic-token',verify_secret='synthetic-secret',officer_character='Fern Melder',membership_only=True,state_file=str(root/'state.json')))
            w.queue_file.parent.mkdir(parents=True);w.sv_file.parent.mkdir(parents=True,exist_ok=True);w.sv_file.write_text('synthetic')
            self.clock=float(self.at)
            roster=dict(exportedAt=self.at-10,total=1,nativeGuild='OLYMPUS PRIME',nativeRealm='Native Realm',members=[dict(name='Fern Melder',guid='Player-1-0000AAAA',rank='High Council',rankIndex=1,level=60)])
            db=dict(lastCharacterGuid='Player-1-0000AAAA',roster=roster)
            def check_source():
                w.sv_file.write_text('OlympusVerifyDB=' + launch._lua(db), encoding='utf-8')
                w.check_savedvars()
            calls=[];source_at=self.at-10;scan_start=self.at
            def control(sequence):
                c=dict(version=1,action='scan',id=str(int(self.clock))+':'+str(sequence),observedAt=int(self.clock),scopeHash=page(self.at)['scopeHash'],guid=db['lastCharacterGuid'],offset=0)
                c['mac']=launch.control_mac('synthetic-secret',c);db['launchControl']=c;return c
            def call(method,path,body=None,retries=3):
                nonlocal source_at,scan_start
                calls.append((method,path))
                if method=='POST':
                    source_at=body['exportedAt'];return True,dict(snapshot=12,members=1,trusted=True)
                if '&cursor=' not in path:scan_start=int(self.clock)
                p=page(int(self.clock),total=1,started=scan_start);p['snapshotAt']=source_at;p['scan']['expiresAt']=min(scan_start+600,source_at+600);p['promotions']=[]
                p['protocol']='officer-operations-v235';return True,p
            w.worker.call=call;control(1)
            with patch.object(watcher.time,'time',lambda:self.clock),patch.object(watcher.time,'sleep'):
                check_source();w.pull_launch_operations()
                old_snapshot=w.launch_scan.expected_snapshot;old_scan=copy.deepcopy(w.launch_scan.pages[0]['scan'])
                w.launch_scan.refreshed=50;self.clock+=100;roster['exportedAt']=int(self.clock)
                replay=control(2);w.state.seen('launch-control:'+replay['guid']+':'+replay['id']);w.state.save()
                w.state.d['sv_mtime']=0;check_source();w.pull_launch_operations()
                self.assertEqual((len(calls),w.launch_scan.refreshed,w.launch_scan.expected_snapshot),(2,50,old_snapshot))
                invalid=control(3);invalid['mac']='0'*32
                w.state.d['sv_mtime']=0;check_source();w.pull_launch_operations()
                self.assertEqual((len(calls),w.launch_scan.refreshed),(2,50))
                expired=control(4);expired['observedAt']-=61;expired['mac']=launch.control_mac('synthetic-secret',expired)
                w.state.d['sv_mtime']=0;check_source();w.pull_launch_operations();self.assertEqual(len(calls),2)
                control(5);w.state.d['sv_mtime']=0;check_source();w.pull_launch_operations()
                self.assertEqual([m for m,p in calls],['POST','GET','POST','GET'])
                self.assertEqual((w.launch_scan.calls,w.launch_scan.refreshed,w.launch_scan.expected_snapshot),(1,0,(12,int(self.clock))))
                self.assertNotEqual(w.launch_scan.pages[0]['scan'],old_scan)
                self.assertEqual(w.state.d['roster_sent'],int(self.clock))

    def test_unacknowledged_new_scan_is_spent_and_held_without_get(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            w=watcher.Watcher(dict(wow_dir=str(root),account='synthetic',worker_url='https://test.invalid',watcher_token='synthetic-token',verify_secret='synthetic-secret',officer_character='Fern Melder',membership_only=True,state_file=str(root/'state.json')))
            w.queue_file.parent.mkdir(parents=True)
            c=dict(version=1,action='scan',id=str(self.at)+':1',observedAt=self.at,scopeHash=page(self.at)['scopeHash'],guid='Player-1-0000AAAA',offset=0)
            c['mac']=launch.control_mac('synthetic-secret',c)
            db=dict(lastCharacterGuid=c['guid'],launchControl=c,roster=dict(exportedAt=self.at,total=1,nativeGuild='OLYMPUS PRIME',nativeRealm='Native Realm',members=[dict(name='Fern Melder',guid=c['guid'],rank='Member',rankIndex=7,level=60)]))
            calls=[];w.worker.call=lambda *a,**k:(calls.append(1) or (False,'unknown'))
            w.read_launch_control(db);w.pull_launch_operations();w.read_launch_control(db);w.pull_launch_operations()
            self.assertEqual(calls,[]);self.assertEqual(w.launch_scan.stopped,'native-roster-receipt-required')
            self.assertTrue(w.state.was_seen('launch-control:'+c['guid']+':'+c['id']))

    def test_transport_body_bound_and_cursor_logging_redaction(self):
        class Reply(io.BytesIO):
            status = 200
        client = watcher.Worker('https://test.invalid', 'synthetic-token')
        client.opener.open = lambda *a, **k: Reply(b'x'*(launch.MAX_BYTES+1))
        self.assertEqual(client.call('GET', launch.PATH, retries=1), (False, 'invalid_response'))
        refusal = urllib.error.HTTPError('https://test.invalid', 429, 'limited', {}, io.BytesIO())
        def refuse(*a, **k):
            raise refusal
        client.opener.open = refuse
        with patch.object(watcher, 'log') as log:
            okay, result = client.call('GET', launch.PATH+'&cursor=private-opaque-value', retries=1)
        self.assertFalse(okay)
        self.assertEqual(result['httpStatus'], 429)
        text = '\n'.join(str(call) for call in log.call_args_list)
        self.assertNotIn('private-opaque-value', text)
        self.assertNotIn('keyVersion=', text)
        refusal.close()


if __name__ == '__main__':
    unittest.main()

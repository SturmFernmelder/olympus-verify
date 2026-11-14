"""Current Watcher custody and selected wire; all transport is synthetic."""
import copy
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
import urllib.parse
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import watcher
import launch_operations229 as launch
import native_rank_attestation as ranks
from native_rank_schemes import NAMES, NATIVE_PROFILE, SCHEME_DIGEST


class DirectiveTransition(unittest.TestCase):
    def setUp(self):
        self.at = int(time.time())
        self.actor, self.target = 'Player-1-0000AAAA', 'Player-1-0000BBBB'
        self.table = dict(version=1, names=list(NAMES))
        self.roster = dict(exportedAt=self.at-1,total=2,nativeGuild='OLYMPUS PRIME',nativeRealm='Native Realm',nativeRankTable=self.table,
                           members=[dict(name='Officer',guid=self.actor,rank='High Council',rankIndex=1,level=60),dict(name='Candidate',guid=self.target,rank='Initiate',rankIndex=9,level=60)])
        self.scope = hashlib.sha256(b'native-scope|1|OLYMPUS PRIME|Native Realm').hexdigest()[:16]

    def control(self):
        c=dict(version=4,action='select-directive',id=f'{self.at}:1',observedAt=self.at,scopeHash=self.scope,guid=self.actor,targetGuids=[self.target],confirmations='[]')
        c['mac']=launch.selected_control_mac('synthetic-secret',c)
        return c

    def page(self):
        at=self.at
        p=dict(version=1,id='synthetic-intent',actorGuid=self.actor,targetGuid=self.target,name='Candidate',subjectDigest='b'*64,rankProfile=NATIVE_PROFILE,rankSchemeDigest=SCHEME_DIGEST,
               originSnapshotId=12,originSnapshotAt=at-1,originContext='a'*32,startSlot=9,finalSlot=7,reason='verified-initiate',issuedAt=at,expiresAt=at+500,acknowledgedSteps=0,lastSnapshotId=12,lastObservedAt=at-1)
        return dict(protocol=launch.PROTOCOL,fetchedAt=at,expiresAt=at+500,status='partial',snapshotId=12,snapshotAt=at-1,memberCount=2,guild='OLYMPUS PRIME',canonicalGuild='OLYMPUS PRIME',realm='Native Realm',scopeHash=self.scope,
                    rankProfile=NATIVE_PROFILE,rankSchemeDigest=SCHEME_DIGEST,rankNames=list(NAMES),entitlements=dict(offset=0,pageSize=20,scanned=1,total=2,unscanned=1,retryAfterSeconds=None),
                    scan=dict(id='a'*32,startedAt=at,expiresAt=at+599),pageCursor='opaque',nextCursor=None,invites=[],riskBuffer=[],held=[],heldReasons=[],
                    promotions=[dict(name='Candidate',guid=self.target,currentSlot=9,targetSlot=7,targetName='Member',reason='verified-initiate',intent=p,intentToken='c3ludGhldGlj.'+'1'*64)],
                    motd=dict(short='Synthetic',bulletin='Synthetic only',characters=9,bytes=9,maxBytes=128),actions=dict(automatic=False,roleGrants=False,removals=False,requiresNativeRecheck=True))

    def test_selected_wire_and_legacy_controls(self):
        c=self.control()
        self.assertTrue(launch.validate_selected_control('synthetic-secret',c,self.at,self.actor,'OLYMPUS PRIME','Native Realm'))
        legacy={k:v for k,v in c.items() if k not in ('targetGuids','confirmations')};legacy.update(version=2,action='select',targetGuid=self.target)
        legacy['mac']=launch.selected_control_mac('synthetic-secret',legacy)
        self.assertTrue(launch.validate_legacy_selected_control('synthetic-secret',legacy,self.at,self.actor,'OLYMPUS PRIME','Native Realm'))
        self.assertFalse(launch.validate_selected_control('synthetic-secret',legacy,self.at,self.actor,'OLYMPUS PRIME','Native Realm'))
        reader=launch.SelectedRead(lambda:self.at)
        reader.request(c,dict(digest=launch.complete_roster_digest(self.roster),exportedAt=self.roster['exportedAt'],snapshot=12),self.roster,self.at)
        calls=[]
        def call(method,path,retries=1):
            calls.append((method,urllib.parse.parse_qs(urllib.parse.urlsplit(path).query),retries))
            return True,dict(version=2,protocol=launch.DIRECTIVE_PROTOCOL,coverageKind='selected-guids',actorGuid=self.actor,controlId=c['id'],targetGuids=[self.target],targetsDigest=launch.targets_digest276([self.target]),coveredGuids=[self.target],page=self.page())
        self.assertTrue(reader.step(call,self.at))
        self.assertTrue(reader.record['completed'])
        self.assertEqual(calls[0][1]['actorGuid'],[self.actor]);self.assertEqual(calls[0][1]['confirmations'],['[]'])
        self.assertEqual(calls[0][1]['keyVersion'],['officer-operations-v234'])
        rendered=launch.render_selected(reader.record,self.at)
        self.assertIn('promotion-selection-directive-v1',rendered);self.assertNotIn('pageCursor',rendered)
        self.assertFalse(launch.validate_page(self.page(),self.at),'selected600s does not renew discovery60s')
        self.assertFalse(reader.running)

    def test_whole_table_and_same_second_original_custody(self):
        with tempfile.TemporaryDirectory() as temp:
            w=watcher.Watcher(dict(wow_dir=temp,account='synthetic',worker_url='https://test.invalid',watcher_token='synthetic-token',verify_secret='synthetic-secret',officer_character='Officer',membership_only=True,state_file=str(Path(temp)/'state.json')))
            originals=[]
            w.post=lambda path,body,label: (originals.append(copy.deepcopy(body)) or watcher.Delivery.DELIVERED)
            w.forward_roster(copy.deepcopy(self.roster))
            first_hash=w.state.d['roster_scope_hash'];first_digest=w._launch_roster_candidate['digest']
            old=copy.deepcopy(self.roster);old['nativeRankTable']['names'][1]='Steward'
            self.assertFalse(ranks.qualified(old['nativeRankTable']))
            w.forward_roster(old)
            self.assertEqual(len(originals),2,'changed empty-rank table at same second must enter original custody')
            self.assertNotEqual(first_hash,w.state.d['roster_scope_hash']);self.assertNotEqual(first_digest,w._launch_roster_candidate['digest'])
            self.assertEqual(originals[0]['nativeRankTable'],self.table)
            self.assertEqual(originals[1]['nativeRankTable']['names'][1],'Steward')
            self.assertIsNone(w._launch_accepted_roster,'new source cannot borrow old ACK')
            w.note_launch_roster_receipt(dict(path='/ingest/roster',body=originals[0]),dict(trusted=True,snapshot=1,members=2))
            self.assertIsNone(w._launch_accepted_roster,'wrong original receipt cannot ACK changed metadata')
            moved=copy.deepcopy(old);moved['members'][1].update(rankIndex=8,rank='Alt')
            w.forward_roster(moved)
            self.assertEqual(len(originals),3,'same-second native rank row changes enter a new original')
            self.assertEqual(originals[2]['members'][1]['rankIndex'],8)
            w.forward_roster(copy.deepcopy(moved))
            self.assertEqual(len(originals),3,'identical current original remains deduplicated')

    def test_transport_protocol_uses_original_body_presence(self):
        class Reply(io.BytesIO):status=200
        w=watcher.Worker('https://test.invalid','synthetic-token');w.membership_only=True
        sent=[]
        def capture(request,**kwargs):sent.append((request.full_url,json.loads(request.data)));return Reply(b'{}')
        w.opener.open=capture
        body=dict(exportedAt=self.at,members=[],nativeRankTable=False)
        self.assertTrue(w.call('POST','/ingest/roster',body,retries=1)[0])
        self.assertIn('keyVersion=native-roster-v2',sent[-1][0]);self.assertIs(sent[-1][1]['nativeRankTable'],False)
        legacy=dict(exportedAt=self.at,members=[])
        self.assertTrue(w.call('POST','/ingest/roster',legacy,retries=1)[0])
        self.assertIn('keyVersion=launch-membership-v1',sent[-1][0]);self.assertNotIn('nativeRankTable',sent[-1][1])


if __name__=='__main__':unittest.main()

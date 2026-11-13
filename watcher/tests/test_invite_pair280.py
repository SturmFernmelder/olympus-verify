"""Exact invite source enum, real Workerd DTO composition and current-clock parser checks."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import time
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import launch_operations229 as launch
from native_rank_schemes import NATIVE_PROFILE, SCHEME_DIGEST, NAMES

def page(row, guild='OLYMPUS PRIME', realm='Native Realm', at=None):
    at = int(time.time()) if at is None else at
    scope=hashlib.sha256(f'native-scope|1|{guild}|{realm}'.encode()).hexdigest()[:16]
    return dict(protocol=launch.PROTOCOL, fetchedAt=at, expiresAt=min(at+60,row['expiresAt']),status='ready',snapshotId=1,snapshotAt=at-1,memberCount=1,guild=guild,canonicalGuild='OLYMPUS PRIME',realm=realm,scopeHash=scope,rankProfile=NATIVE_PROFILE,rankSchemeDigest=SCHEME_DIGEST,rankNames=list(NAMES),scan=dict(id='a'*32,startedAt=at,expiresAt=at+590),pageCursor='synthetic-read-only-parser-page',entitlements=dict(offset=0,pageSize=20,scanned=1,total=1,unscanned=0,retryAfterSeconds=None),nextCursor=None,invites=[row],promotions=[],riskBuffer=[],held=[],heldReasons=[],motd=dict(short='Test',bulletin='',characters=4,bytes=4,maxBytes=128),actions=dict(automatic=False,roleGrants=False,removals=False,requiresNativeRecheck=True))

def sample(source):
    at=int(time.time())
    return dict(queueId=1,proofId='1'*32,name='Fresh Candidate',guid='Player-4613-ABCDEF12',fullName='Fresh Candidate',scopeHash=hashlib.sha256(b'native-scope|1|OLYMPUS PRIME|Native Realm').hexdigest()[:16],observedAt=at,expiresAt=at+60,reason='knight-unguilded',source=source)

class InviteSources280(unittest.TestCase):
    def test_both_existing_sources_and_original_lifetime(self):
        for source in ('native-who-unit-v233','native-who-whisper-v242'):
            with self.subTest(source=source):
                row=sample(source);body=page(row);self.assertTrue(launch.validate_page(body,int(time.time())))
                self.assertFalse(launch.validate_page(body,row['expiresAt']))
                self.assertTrue(launch.validate_page(body,row['expiresAt'],allow_stale=True))
    def test_no_new_pair_or_dto_version_is_invented(self):
        for source in ('native-who-unit-v242','native-who-whisper-v233','membership-absence','native-who-whisper-v242 ',None):
            with self.subTest(source=source):self.assertFalse(launch.validate_page(page(sample(source)),int(time.time())))
        body=page(sample('native-who-whisper-v242'));body['invites'][0]['version']=242
        self.assertFalse(launch.validate_page(body,int(time.time())))
    def test_scope_identity_and_unguarded_action_negatives(self):
        for changes in ({'scopeHash':'0'*16},{'fullName':'Other'},{'queueId':True},{'expiresAt':int(time.time())+61},{'reason':'membership'},{'guid':'Not a GUID'}):
            body=page(sample('native-who-whisper-v242'));body['invites'][0].update(changes)
            with self.subTest(changes=changes):self.assertFalse(launch.validate_page(body,int(time.time())))
        body=page(sample('native-who-whisper-v242'));body['actions']['automatic']=True
        self.assertFalse(launch.validate_page(body,int(time.time())))

if __name__=='__main__':
    if '--projection' in sys.argv:
        raw=json.loads(Path(sys.argv[sys.argv.index('--projection')+1]).read_text(encoding='utf-8'));scope=raw['sourceScope'];rows=raw['projection']['invites'];checks=[launch.validate_page(page(row,scope['guild'],scope['realm']),int(time.time())) for row in rows]
        if raw.get('kind')=='directive': checks.append(launch.validate_page(raw['fullPage'],int(time.time())))
        print(json.dumps({'scope':'Actual unchanged Worker invite row composed into synthetic full current parser page; not site endpoint or frontend acceptance','rows':len(rows),'ok':all(checks),'checks':checks}));sys.exit(0 if all(checks) else 1)
    unittest.main()

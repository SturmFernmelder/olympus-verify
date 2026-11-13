"""Startup capability negotiation uses only synthetic health responses and temp state."""
import copy
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import watcher


class NativeProtocolReadiness280(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.w=watcher.Watcher(dict(wow_dir=self.tmp.name,account='SYNTHETIC',worker_url='https://test.invalid',
            watcher_token='synthetic-token',verify_secret='synthetic-secret',officer_character='Officer',
            membership_only=True,state_file=str(Path(self.tmp.name)/'state.json')))

    def health(self):
        return dict(ok=True,build='2026-11-13.280',verification=dict(mode='members-only',nativeScopePinned=True,
                    nativeMembershipProofVersion=1,nativeRosterProtocolVersion=2))

    def test_old_rollback_legacy_missing_or_wrong_native_capability_stops_before_ingestion(self):
        for patch_value in ({'nativeRosterProtocolVersion':None},{'nativeRosterProtocolVersion':1},
                            {'nativeRosterProtocolVersion':True},{'mode':'legacy'},{'nativeScopePinned':False}):
            with self.subTest(value=patch_value):
                reply=self.health();reply['verification'].update(patch_value)
                calls=[];before=copy.deepcopy(self.w.state.d)
                self.w.worker.call=lambda method,path,**kw:(calls.append((method,path)) or (True,reply))
                with self.assertRaises(watcher.LaunchNotReady):self.w.require_launch_worker()
                self.assertEqual(calls,[('GET','/health')])
                self.assertEqual(self.w.state.d,before)

    def test_exact_current_capability_is_accepted_without_ingestion(self):
        calls=[]
        self.w.worker.call=lambda method,path,**kw:(calls.append((method,path)) or (True,self.health()))
        self.w.require_launch_worker()
        self.assertEqual(calls,[('GET','/health')])


if __name__=='__main__':unittest.main()

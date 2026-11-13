"""Actual launch consumer input boundaries; synthetic signed controls and local Lua only."""
import copy
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0,os.environ.get('WATCHER_TEST_SOURCE',str(Path(__file__).resolve().parents[1])))
import launch_operations229 as launch
from test_launch_operations229 import page


class LaunchInputSafety280(unittest.TestCase):
    at=1_900_000_000
    actor='Player-1-0000AAAA'
    target='Player-1-0000BBBB'

    def control(self,confirmations='[]'):
        c=dict(version=4,action='select-directive',id=str(self.at)+':1',observedAt=self.at,
               scopeHash=page(self.at)['scopeHash'],guid=self.actor,targetGuids=[self.target],confirmations=confirmations)
        c['mac']=launch.selected_control_mac('synthetic-secret',c)
        return c

    def valid(self,c):
        return launch.validate_selected_control('synthetic-secret',c,self.at,self.actor,'OLYMPUS PRIME','Native Realm')

    def held(self):
        p=page(self.at)
        p.update(status='held',promotions=[],invites=[],riskBuffer=[])
        return p

    def wrapper(self,p):
        return dict(version=3,controlId='synthetic-control',scanComplete=False,running=False,stoppedReason='source-held',
                    discoveredPages=1,refreshedPages=0,pages=[p])

    def test_valid_signed_control_is_unchanged(self):
        self.assertTrue(self.valid(self.control()))

    def test_invalid_mac_is_refused_before_confirmation_json_parse(self):
        c=self.control();c['mac']='0'*32
        with patch.object(launch.json,'loads',side_effect=AssertionError('Unverified confirmation data reached parser')) as parser:
            self.assertFalse(self.valid(c))
        parser.assert_not_called()

    def test_signed_and_unsigned_deep_json_are_refused_without_recursion(self):
        for size,signed in ((2_000,True),(40_000,False)):
            with self.subTest(size=size,signed=signed):
                c=self.control('['*size)
                if not signed:c['mac']='0'*32
                self.assertFalse(self.valid(c))

    def test_oversize_signed_confirmation_is_refused(self):
        self.assertFalse(self.valid(self.control('[]'+' '*8192)))

    def test_held_rank_metadata_is_all_null_or_exact_current_constants(self):
        p=self.held()
        self.assertTrue(launch.validate_page(p,self.at))
        p.update(rankProfile=None,rankSchemeDigest=None,rankNames=None)
        self.assertTrue(launch.validate_page(p,self.at))
        for key,value in (('rankProfile','bad\nprofile'),('rankSchemeDigest','0'*64),('rankNames',{'unsafe-key':0}),('rankNames',[])):
            with self.subTest(key=key,value=value):
                changed=copy.deepcopy(p);changed[key]=value
                self.assertFalse(launch.validate_page(changed,self.at))
                self.assertIsNone(launch.render_pages(self.wrapper(changed),self.at))

    def test_held_dictionary_injection_cannot_execute_in_actual_lua(self):
        from lupa.luajit21 import LuaRuntime
        p=self.held();p['rankNames']={'x=1}}}}; INJECTED280=true; --':0}
        body=launch.render_pages(self.wrapper(p),self.at)
        runtime=LuaRuntime(unpack_returned_tuples=True)
        if body is not None:runtime.execute(body)
        self.assertIsNone(runtime.globals().INJECTED280)
        self.assertIsNone(body)

    def test_lua_writer_refuses_nonidentifier_keyword_and_nonfinite_inputs(self):
        for value in ({'unsafe-key':0},{'end':0},{7:'numeric'},float('nan'),float('inf')):
            with self.subTest(value=value),self.assertRaises(ValueError):
                launch._lua(value)

    def test_valid_held_projection_round_trips_without_new_authority(self):
        import savedvars
        p=self.held();body=launch.render_pages(self.wrapper(p),self.at)
        parsed=savedvars.parse(body)['OlympusLaunchQueue']
        self.assertEqual(parsed['pages'][0]['rankNames'],p['rankNames'])
        self.assertFalse(parsed['pages'][0]['promotions'])
        self.assertFalse(parsed['pages'][0]['actions']['automatic'])


if __name__=='__main__':unittest.main()

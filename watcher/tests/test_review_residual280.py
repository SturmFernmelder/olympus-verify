"""Regression challenges for strict roster sources and exact original retry custody. No provider/native actions."""
from pathlib import Path
import copy,json,os,sys,time,unittest
from unittest.mock import patch
source=Path(os.environ.get('WATCHER_TEST_SOURCE',Path(__file__).resolve().parents[1]))
sys.path.insert(0,str(source/'tests'));sys.path.insert(0,str(source))
import test_watcher_source280 as fixture
import watcher,intake242,savedvars

class ReviewResidual280(unittest.TestCase):
 def setUp(self):
  self.f=fixture.WatcherSource280Tests();self.f.setUp();self.addCleanup(self.f.doCleanups)
  self.w=self.f.w;self.at=int(time.time())
 def invalid_roster(self,value):
  roster=dict(exportedAt=self.at,total=1,nativeGuild='OLYMPUS PRIME',nativeRealm='Native Realm',members=[dict(name='Fern Melder',guid='Player-1-1234ABCD',rank='Guild Master',rankIndex=0,level=60,lastOnline=value)])
  return roster
 def test_real_nonfinite_source_is_held_and_valid_collected_intake_progresses(self):
  self.f.write({'current':self.f.row()},roster=self.invalid_roster('RAW_NONFINITE'),lastCharacterGuid='Player-1-1234ABCD',events=[])
  raw=self.w.sv_file.read_text().replace('"RAW_NONFINITE"','1e309');self.w.sv_file.write_text(raw)
  self.assertEqual(str(savedvars.parse(raw)['OlympusVerifyDB']['roster']['members'][0]['lastOnline']),'inf')
  original=self.w.sv_file.read_bytes();observed=[]
  for _ in range(2):
   try:self.w.check_savedvars();kind=None
   except Exception as error:kind=type(error).__name__
   observed.append(kind)
  self.assertEqual(observed,['SavedVariablesSourceUnavailable']*2)
  self.assertEqual([x[1] for x in self.f.calls],[intake242.PATH])
  self.assertEqual(self.w.state.d['intake242']['current']['state'],'done')
  self.assertEqual(self.w.state.d['sv_mtime'],0);self.assertFalse(self.w._custody_halted)
  self.assertEqual(self.w.sv_file.read_bytes(),original)
 def test_direct_unserializable_roster_does_not_change_scan_or_ack_candidates(self):
  for value in (float('inf'),{1:'number-key','z':'string-key'}):
   with self.subTest(value=str(value)):
    old={'advisory':'unchanged'};self.w._launch_accepted_roster=old;before=copy.deepcopy(self.w.state.d)
    try:self.w.forward_roster(self.invalid_roster(value));kind=None
    except Exception as error:kind=type(error).__name__
    self.assertEqual(kind,'SavedVariablesSourceUnavailable')
    self.assertIs(self.w._launch_accepted_roster,old);self.assertEqual(self.w.state.d,before);self.assertEqual(self.f.calls,[])
 def prepare_retry(self):
  body=self.f.row();body['requestedAt']=self.at-30;row=self.f.original(body);self.w.state.d['intake242']={body['id']:row};self.sent=[]
  def transport(method,path,payload,retries=3):
   self.sent.append(copy.deepcopy(payload))
   return True,dict(version=242,deferred=[dict(id=body['id'],character=body['character'],guid=body['guid'],outcome='membership_source_pending',originalNoEffect=True)],acknowledgements=[])
  self.w.worker.call=transport
  with patch.object(intake242.time,'time',return_value=self.at):intake242.drain(self.w,False)
  self.assertEqual(len(self.sent),1);return row
 def test_rehashed_changed_original_cannot_reuse_prior_process_no_effect_witness(self):
  row=self.prepare_retry();row['body']['requestedAt']+=20;row['sha256']=intake242._canonical_body(row['body'])[1];mutated=copy.deepcopy(row['body'])
  with patch.object(intake242.time,'time',return_value=self.at+60):intake242.drain(self.w,False)
  self.assertEqual(len(self.sent),1);self.assertEqual(row['body'],mutated);self.assertTrue(row['attempted']);self.assertEqual(row['state'],'outcome_unknown')
 def test_unchanged_retry_uses_exact_original_only_at_due_time(self):
  row=self.prepare_retry();body=copy.deepcopy(row['body']);sha=row['sha256']
  with patch.object(intake242.time,'time',return_value=self.at+59):intake242.drain(self.w,False)
  self.assertEqual(len(self.sent),1)
  with patch.object(intake242.time,'time',return_value=self.at+60):intake242.drain(self.w,False)
  self.assertEqual(len(self.sent),2);self.assertEqual(self.sent[0],self.sent[1]);self.assertEqual(row['body'],body);self.assertEqual(row['sha256'],sha)
 def test_cloned_row_serialized_metadata_does_not_acquire_process_witness(self):
  row=self.prepare_retry();clone=copy.deepcopy(row);self.w.state.d['intake242']['current']=clone
  with patch.object(intake242.time,'time',return_value=self.at+60):intake242.drain(self.w,False)
  self.assertEqual(len(self.sent),1);self.assertEqual(clone['state'],'outcome_unknown')
 def test_real_save_reload_cannot_adopt_serialized_retry_metadata(self):
  row=self.prepare_retry();self.w.state.save();other=watcher.Watcher(self.f.cfg);other.worker.paused=lambda:None;other.worker.call=lambda *a,**k:self.fail('Reload retried a prior known original')
  with patch.object(intake242.time,'time',return_value=self.at+60):intake242.drain(other,False)
  self.assertEqual(other.state.d['intake242']['current']['state'],'outcome_unknown');self.assertEqual(other.state.d['intake242']['current']['body'],row['body'])
 def test_changed_delivery_binding_never_uses_original_retry(self):
  row=self.prepare_retry();self.w.worker.token='different-synthetic-token'
  with patch.object(intake242.time,'time',return_value=self.at+60):intake242.drain(self.w,False)
  self.assertEqual(len(self.sent),1);self.assertEqual(row['state'],'outcome_unknown')
 def test_unrelated_nonserializable_cursor_save_remains_global_halt(self):
  self.f.write({});self.w.state.d['invalid']=object();self.w.note_saved_relay=lambda *a:None;self.w.forward_roster=lambda *a,**k:None;self.w.read_launch_control=lambda *a:None
  with self.assertRaises(TypeError):self.w.check_savedvars()
  self.assertTrue(self.w._custody_halted);self.assertEqual(self.f.calls,[])

if __name__=='__main__':unittest.main(verbosity=2)

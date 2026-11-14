import copy,json,os,sys,time,unittest
from pathlib import Path
s=Path(__file__).resolve().parents[1];sys.path.insert(0,str(s/'tests'));sys.path.insert(0,str(s))
import launch_operations229 as launch
from test_launch_operations229 import page
import test_launch_selected as selected_fixture

class Discovery235Consumer(unittest.TestCase):
 at=1900000000
 def rankheld(self):
  p=page(self.at);p.update(protocol='officer-operations-v235',status='partial',rankProfile=None,rankSchemeDigest=None,rankNames=None,promotions=[],riskBuffer=[],held=[])
  p['heldReasons']=['directive-rank-policy-held'];return p
 def wrapper(self,pages):return dict(version=3,controlId='synthetic-discovery',scanComplete=True,running=False,stoppedReason=None,discoveredPages=len(pages),refreshedPages=0,pages=pages)
 def test_legacy234_stays_strict_and_protocols_have_no_fallback(self):
  self.assertTrue(launch.validate_page(page(self.at),self.at));new=self.rankheld();self.assertFalse(launch.validate_page(new,self.at));self.assertTrue(launch.validate_discovery235(new,self.at));self.assertFalse(launch.validate_discovery235(page(self.at),self.at))
  old=copy.deepcopy(new);old['protocol']='officer-operations-v234';self.assertFalse(launch.validate_page(old,self.at))
 def test_rankless_partial_is_data_only_and_selected234_never_accepts_it(self):
  p=self.rankheld();self.assertTrue(launch.validate_discovery235(p,self.at));body=launch.render_pages(self.wrapper([p]),self.at);self.assertIsNotNone(body);self.assertIn('officer-operations-v235',body)
  f=selected_fixture.SelectedReads();f.setUp();f.tick(f.call(lambda:(True,f.reply(ttl=600))));self.assertFalse(launch._selected_page(p,f.selected.record,f.selected.record['coveredGuids'],self.at))
 def test_rankless_page_requires_closed_rank_hold_and_zero_rank_arrays(self):
  base=self.rankheld()
  for mutate in [lambda p:p.update(rankProfile='bad'),lambda p:p.update(rankSchemeDigest='0'*64),lambda p:p.update(rankNames={'unsafe-key':0}),lambda p:p.update(status='ready'),lambda p:p.update(heldReasons=[]),lambda p:p['promotions'].append(page(self.at)['promotions'][0]),lambda p:p['riskBuffer'].append({'guid':'x'})]:
   p=copy.deepcopy(base);mutate(p);self.assertFalse(launch.validate_discovery235(p,self.at))
 def test_new235_cursors_are8192_only_legacy234_unchanged4096(self):
  p=self.rankheld();p['pageCursor']='a'*8192;p['nextCursor']='b'*8192;self.assertTrue(launch.validate_discovery235(p,self.at));p['nextCursor']+='b';self.assertFalse(launch.validate_discovery235(p,self.at))
  old=page(self.at);old['pageCursor']='a'*4096;self.assertTrue(launch.validate_page(old,self.at));old['pageCursor']+='a';self.assertFalse(launch.validate_page(old,self.at))
 def scan(self,new):
  scan=launch.Scan(lambda:self.at,discovery235=new);scan.request(dict(action='scan',id='new',scopeHash=page(self.at)['scopeHash']),self.at);return scan
 def test_new_scan_uses235_path_and_does_not_downgrade234_reply(self):
  scan=self.scan(True);calls=[]
  def call(method,path,retries):calls.append(path);return True,page(self.at)
  scan.step(call,self.at);self.assertEqual(calls,[launch.DISCOVERY_PATH235]);self.assertFalse(scan.step(call,self.at+5));self.assertEqual(len(calls),1)
 def test_new_scan_and_legacy_scan_each_accept_only_own_positive(self):
  for new in [True,False]:
   scan=self.scan(new);paths=[]
   def call(method,path,retries):paths.append(path);return True,self.rankheld() if new else page(self.at)
   self.assertTrue(scan.step(call,self.at));self.assertTrue(scan.complete);self.assertEqual(paths,[launch.DISCOVERY_PATH235 if new else launch.PATH])
 def test_mixed_page_protocol_cannot_make_one_projection(self):
  a=page(self.at,0,40);b=page(self.at,20,40);b['protocol']='officer-operations-v235';self.assertIsNone(launch.render_pages(self.wrapper([a,b]),self.at))
 def test_selected_transport_stays234(self):
  f=selected_fixture.SelectedReads();f.setUp();paths=[]
  def call(method,path,retries):paths.append(path);return True,f.reply()
  f.selected.step(call,f.at);self.assertTrue(f.selected.record['completed']);self.assertTrue(paths[0].startswith(launch.PATH+'&'));self.assertNotIn('v235',paths[0])

if __name__=='__main__':unittest.main(verbosity=2)

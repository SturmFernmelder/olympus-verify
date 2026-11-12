"""Selected promotion reads: actual Python modules, synthetic HTTP and temporary files."""
import copy
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import urllib.parse

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import launch_operations229 as launch
import savedvars
import watcher
from test_launch_operations229 import page


class SelectedReads(unittest.TestCase):
    def setUp(self):
        self.at=1900000000
        self.clock=float(self.at)
        self.roster=dict(exportedAt=self.at,total=40,online=1,nativeGuild='OLYMPUS PRIME',nativeRealm='Native Realm',
            members=[dict(guid=f'Player-1-{i:08X}',name='Fern Melder' if i==1 else 'Member '+str(i),full='Member '+str(i),
                          rank='Initiate',rankIndex=9,level=60,**{'class':'MAGE'},note='',onote='',lastOnline=0) for i in range(1,41)])
        self.control=dict(version=2,action='select',id=str(self.at)+':1',observedAt=self.at,scopeHash=page(self.at)['scopeHash'],
                          guid=self.roster['members'][0]['guid'],targetGuid=self.roster['members'][20]['guid'])
        self.control['mac']=launch.selected_control_mac('synthetic-secret',self.control)
        self.accepted=dict(snapshot=12,exportedAt=self.at,digest=launch.complete_roster_digest(self.roster))
        self.selected=launch.SelectedRead(lambda:self.clock)
        self.selected.request(self.control,self.accepted,self.roster,self.clock)
        self.calls=[]

    def reply(self,offset=20,retry=None):
        p=page(int(self.clock),offset,40,self.at)
        p.update(snapshotAt=self.at,nextCursor=None,pageCursor='opaque-private-v4-context',invites=[],riskBuffer=[])
        p['scan'].update(startedAt=self.at,expiresAt=self.at+600)
        p['expiresAt']=min(int(self.clock)+60,self.at+600)
        p['entitlements']['retryAfterSeconds']=retry
        if retry is not None:p['status']='partial';p['heldReasons'].append('discord-rate-limited')
        covered=[row['guid'] for row in self.roster['members'][offset:offset+20]]
        return dict(version=1,protocol=launch.SELECTED_PROTOCOL,controlId=self.control['id'],
                    targetGuid=self.control['targetGuid'],coveredGuids=covered,page=p)

    def call(self,response=None):
        def transport(method,path,retries):
            self.assertEqual((method,retries),('GET',1))
            self.calls.append(urllib.parse.parse_qs(urllib.parse.urlsplit(path).query))
            self.clock+=1
            return response() if callable(response) else response if response is not None else (True,self.reply())
        return transport

    def tick(self,transport):
        self.clock=max(self.clock,self.selected.next_at)
        return self.selected.step(transport,self.clock)

    def test_control_v2_exact_mac_actor_target_clock_and_legacy_separation(self):
        args=('synthetic-secret',self.control,self.at,self.control['guid'],'OLYMPUS PRIME','Native Realm')
        self.assertTrue(launch.validate_selected_control(*args))
        for change in (dict(version=1),dict(action='recheck'),dict(id=str(self.at-1)+':1'),dict(targetGuid='Player-1-00000002'),
                       dict(guid='Player-1-00000002'),dict(offset=0),dict(mac='0'*32),dict(observedAt=self.at-61)):
            with self.subTest(change=change):
                changed={**self.control,**change}
                self.assertFalse(launch.validate_selected_control(args[0],changed,*args[2:]))
        self.assertFalse(launch.validate_control(*args))

    def test_success_is_separate_bounded_observation_and_cursor_never_reaches_lua(self):
        self.assertTrue(self.tick(self.call()))
        r=self.selected.record
        self.assertEqual((r['attempts'],r['completed'],r['running'],r['stoppedReason']),(1,True,False,None))
        self.assertEqual(r['page']['entitlements']['offset'],20)
        self.assertIn(self.control['targetGuid'],r['coveredGuids'])
        self.assertEqual(r['startedAt'],self.control['observedAt'])
        self.assertEqual(r['expiresAt'],self.at+600)
        self.assertEqual(r['page']['expiresAt'],int(self.clock)+60)
        body=launch.render_selected(r,int(self.clock));self.assertIsNotNone(body)
        parsed=savedvars.parse(body)['OlympusLaunchSelected']
        self.assertNotIn('pageCursor',parsed['page']);self.assertNotIn('nextCursor',parsed['page'])
        self.assertNotIn('opaque-private-v4-context',body)
        before=copy.deepcopy(r);later=copy.deepcopy(self.roster);later['exportedAt']+=30;later['online']+=1
        self.assertFalse(self.selected.source_changed(later));self.assertEqual(self.selected.record,before)
        self.clock+=700;self.assertFalse(self.tick(self.call()));self.assertEqual(len(self.calls),1)

    def test_missing_receipt_or_target_is_held_without_borrowed_authority(self):
        for accepted,roster in ((None,self.roster),({**self.accepted,'digest':'0'*64},self.roster),
                                (self.accepted,{**self.roster,'exportedAt':self.at+1})):
            with self.subTest(accepted=accepted is None):
                self.selected.request(self.control,accepted,roster,self.clock)
                r=self.selected.record
                self.assertEqual((r['attempts'],r['running'],r['completed'],r['page'],r['coveredGuids']),(0,False,False,None,[]))
                self.assertIsNone(r['snapshotId']);self.assertIsNone(r['snapshotAt']);self.assertIsNone(r['expiresAt'])
                self.assertIsNotNone(launch.render_selected(r,int(self.clock)))
        missing={**self.control,'targetGuid':'Player-1-0000FFFF'}
        self.selected.request(missing,self.accepted,self.roster,self.clock)
        self.assertEqual(self.selected.record['stoppedReason'],'selected-target-unavailable')
        self.assertFalse(self.tick(self.call()));self.assertEqual(self.calls,[])

    def test_pending_source_replacement_holds_but_completed_observation_is_not_rebased(self):
        for change in ('time','rank','scope'):
            with self.subTest(change=change):
                self.selected.request(self.control,self.accepted,self.roster,self.clock)
                changed=copy.deepcopy(self.roster)
                if change=='time':changed['exportedAt']+=1
                elif change=='rank':changed['members'][20]['rankIndex']=8
                else:changed['nativeRealm']='Other Realm'
                self.assertTrue(self.selected.source_changed(changed))
                self.assertEqual(self.selected.record['stoppedReason'],'native-roster-changed-or-expired')
                self.assertFalse(self.tick(self.call()))
        self.assertEqual(self.calls,[])

    def test_fixed_initial_params_outer429_then_v4_retry_never_traverse(self):
        self.tick(self.call((False,dict(httpStatus=429,retryAfterSeconds=5))))
        initial=copy.deepcopy(self.calls[0])
        self.tick(self.call(lambda:(True,self.reply(retry=5))))
        self.tick(self.call())
        self.assertEqual((len(self.calls),self.selected.record['attempts'],self.selected.record['completed']),(3,3,True))
        self.assertEqual(self.calls[1],initial)
        for query in self.calls:
            self.assertEqual(query['selectionId'],[self.control['id']]);self.assertEqual(query['snapshotId'],['12'])
            self.assertEqual(query['snapshotAt'],[str(self.at)]);self.assertEqual(query['targetGuid'],[self.control['targetGuid']])
        self.assertEqual(self.calls[2]['cursor'],['opaque-private-v4-context'])
        self.assertNotIn('cursor',self.calls[1])

    def test_three_known429_attempt_ceiling_and_initial_admission_expiry(self):
        for attempt in range(3):self.tick(self.call((False,dict(httpStatus=429,retryAfterSeconds=5))))
        self.assertEqual((self.selected.record['attempts'],self.selected.record['stoppedReason']),(3,'rate-limit-retries-exhausted'))
        self.clock+=30;self.assertFalse(self.tick(self.call()));self.assertEqual(len(self.calls),3)
        self.selected.request(self.control,self.accepted,self.roster,self.at)
        self.clock=float(self.at);self.tick(self.call((False,dict(httpStatus=429,retryAfterSeconds=60))))
        self.assertFalse(self.selected.running);self.assertEqual(self.selected.record['attempts'],1)
        self.selected.request(self.control,self.accepted,self.roster,self.at);self.clock=self.at+60
        self.assertTrue(self.tick(self.call()));self.assertEqual(self.selected.record['attempts'],0)

    def test_returned_v4_retry_keeps_original_context_after_initial_sixty_seconds(self):
        self.tick(self.call(lambda:(True,self.reply(retry=70))))
        self.assertTrue(self.selected.running)
        self.tick(self.call())
        self.assertTrue(self.selected.record['completed']);self.assertEqual(len(self.calls),2)
        self.assertGreater(self.clock,self.at+60)
        self.assertEqual(self.selected.record['expiresAt'],self.at+600)
        self.assertEqual(self.calls[1]['cursor'],['opaque-private-v4-context'])

    def test_initial_admission_expiry_is_reported_before_an_inherited_later_due_time(self):
        self.selected.next_at=self.at+300
        self.clock=self.at+60
        self.assertTrue(self.selected.step(self.call(),self.clock))
        self.assertEqual(self.calls,[])
        self.assertEqual(self.selected.record['attempts'],0)
        self.assertFalse(self.selected.running)
        self.assertEqual(self.selected.record['stoppedReason'],'selection-admission-expired')
        self.assertEqual(self.selected.record['expiresAt'],self.at+600)
        self.assertIsNotNone(launch.render_selected(self.selected.record,int(self.clock)))

    def test_initial_response_after_sixty_seconds_keeps_its_valid_admission(self):
        self.clock=self.at+59
        def response():
            self.clock+=1
            return True,self.reply()
        self.assertTrue(self.selected.step(self.call(response),self.clock))
        self.assertEqual(self.clock,self.at+61)
        self.assertTrue(self.selected.record['completed'])
        self.assertEqual(self.selected.record['attempts'],1)
        self.assertEqual(self.selected.record['expiresAt'],self.at+600)

    def test_invalid_wrappers_coverage_scope_dates_and_nonpromotion_data_hold(self):
        changes=[lambda r:r.update(controlId=str(self.at)+':99'),lambda r:r.update(targetGuid='Player-1-00000002'),
                 lambda r:r.update(coveredGuids=r['coveredGuids'][:-1]),lambda r:r['coveredGuids'].__setitem__(0,'Player-1-0000FFFF'),
                 lambda r:r['page'].update(snapshotAt=self.at-1),lambda r:r['page'].update(scopeHash='0'*16),
                 lambda r:r['page']['scan'].update(startedAt=self.at+1),lambda r:r['page'].update(nextCursor='no-traversal'),
                 lambda r:r['page']['riskBuffer'].append(dict(guid='Player-1-00000023',name='Other',currentSlot=9,level=60,lastOnlineDays=1,reason='unverified-initiate',reviewOnly=True))]
        for mutate in changes:
            with self.subTest(mutate=mutate):
                self.selected.request(self.control,self.accepted,self.roster,self.at);self.clock=float(self.at)
                reply=self.reply();mutate(reply)
                self.tick(self.call((True,reply)))
                self.assertFalse(self.selected.record['completed']);self.assertEqual(self.selected.record['page'],None)
                self.assertEqual(self.selected.record['stoppedReason'],'invalid-selected-page')

    def test_unknown_auth_refusal_and_original_expiry_never_retry(self):
        for response in ((False,'unknown'),(False,dict(httpStatus=403)),(False,dict(httpStatus=409,error='selection_native_source_changed'))):
            with self.subTest(response=response):
                self.selected.request(self.control,self.accepted,self.roster,self.at);self.clock=float(self.at)
                count=len(self.calls);self.tick(self.call(response));self.clock+=6
                self.assertFalse(self.tick(self.call()));self.assertEqual(len(self.calls),count+1)
                self.assertFalse(self.selected.record['completed'])
        self.selected.request(self.control,self.accepted,self.roster,self.at);self.clock=self.at+600
        count=len(self.calls);self.assertTrue(self.tick(self.call()));self.assertEqual(len(self.calls),count)
        self.assertEqual(self.selected.record['stoppedReason'],'scan-expired')

    def watcher(self,root):
        w=watcher.Watcher(dict(wow_dir=str(root),account='synthetic',worker_url='https://test.invalid',watcher_token='synthetic-token',
            verify_secret='synthetic-secret',officer_character='Fern Melder',membership_only=True,state_file=str(root/'state.json')))
        w.queue_file.parent.mkdir(parents=True);w.sv_file.parent.mkdir(parents=True,exist_ok=True)
        original=launch.render_pages(dict(version=2,controlId=str(self.at-1200)+':1',scanComplete=True,running=False,stoppedReason='scan-expired',
            discoveredPages=49,refreshedPages=11,pages=[page(self.at-1200+i*5,i*20,963,self.at-1200) for i in range(49)]),self.at)
        self.assertIsNotNone(original);w.launch_operations_file.write_text(original,encoding='utf-8')
        db=dict(lastCharacterGuid=self.control['guid'],launchControl=self.control,roster=self.roster)
        w.sv_file.write_text('OlympusVerifyDB='+launch._lua(db),encoding='utf-8')
        def call(method,path,body=None,retries=3):
            if method=='POST':return True,dict(snapshot=12,members=len(body['members']),trusted=True)
            return self.call()(method,path,retries)
        w.worker.call=call
        return w,db,w.launch_operations_file.read_bytes()

    def test_actual_intake_restart_select_separate_file_and_completed_reload_retention(self):
        with tempfile.TemporaryDirectory() as temporary:
            w,db,original=self.watcher(Path(temporary))
            with patch.object(watcher.time,'time',lambda:self.clock),patch.object(watcher.time,'sleep'):
                w.check_savedvars();w.pull_launch_operations()
                self.assertTrue(w.launch_selected.record['completed'])
                self.assertEqual(w.launch_operations_file.read_bytes(),original)
                self.assertEqual(w.launch_scan.pages,{})
                selected_bytes=w.launch_selected_file.read_bytes();selected=copy.deepcopy(w.launch_selected.record)
                self.clock+=10;db['roster']['exportedAt']=int(self.clock);db['roster']['online']=2
                w.sv_file.write_text('OlympusVerifyDB='+launch._lua(db));w.state.d['sv_mtime']=0
                w.check_savedvars();w.pull_launch_operations()
                self.assertEqual(w.launch_selected.record,selected);self.assertEqual(w.launch_selected_file.read_bytes(),selected_bytes)
                self.assertEqual(w.launch_operations_file.read_bytes(),original);self.assertEqual(len(self.calls),1)
                restarted=watcher.Watcher(w.cfg);restarted.worker.call=lambda *a,**k:self.fail('restart cannot resume selection')
                restarted.pull_launch_operations()
                self.assertEqual(w.launch_operations_file.read_bytes(),original);self.assertEqual(w.launch_selected_file.read_bytes(),selected_bytes)

    def test_actual_wrapper_expires_initial_admission_before_shared_gate_or_missing_witness(self):
        for witness in ('healthy','missing'):
            with self.subTest(witness=witness),tempfile.TemporaryDirectory() as temporary:
                self.setUp();w,db,original=self.watcher(Path(temporary))
                with patch.object(watcher.time,'time',lambda:self.clock),patch.object(watcher.time,'sleep') as sleep:
                    w.check_savedvars()
                    self.assertTrue(w.launch_selected.running)
                    self.assertIsNotNone(w._launch_consumed_sv_witness)
                    sleep.reset_mock()
                    w.launch_selected.next_at=self.at+100
                    w._next_launch_read_at=self.at+100
                    if witness=='missing':w._launch_consumed_sv_witness=None
                    self.clock=self.at+60
                    w.pull_launch_operations()
                    self.assertFalse(w.launch_selected.running)
                    self.assertEqual(w.launch_selected.record['stoppedReason'],'selection-admission-expired')
                    self.assertEqual(w.launch_selected.record['attempts'],0)
                    self.assertEqual(w._next_launch_read_at,self.at+100)
                    self.assertEqual(self.calls,[]);sleep.assert_not_called()
                    output=savedvars.parse_file(w.launch_selected_file)['OlympusLaunchSelected']
                    self.assertEqual(output['stoppedReason'],'selection-admission-expired')
                    self.assertFalse(output['completed'])
                    self.assertEqual(w.launch_operations_file.read_bytes(),original)

    def test_actual_same_second_skipped_or_refused_upload_cannot_borrow_old_ack(self):
        for outcome in ('same-second','refused'):
            with self.subTest(outcome=outcome),tempfile.TemporaryDirectory() as temporary:
                w,db,original=self.watcher(Path(temporary))
                w._launch_accepted_roster=copy.deepcopy(self.accepted)
                if outcome=='same-second':
                    w.state.d['roster_sent']=self.at
                    scope={key:self.roster[key] for key in ('nativeGuild','nativeRealm')}
                    import hashlib,json
                    w.state.d['roster_scope_hash']=hashlib.sha256(json.dumps(scope,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
                else:w.worker.call=lambda *a,**k:(False,'unknown')
                with patch.object(watcher.time,'time',lambda:self.clock),patch.object(watcher.time,'sleep'):
                    w.check_savedvars();w.pull_launch_operations()
                self.assertFalse(w.launch_selected.record['completed']);self.assertFalse(w.launch_selected.running)
                self.assertEqual(w.launch_selected.record['attempts'],0);self.assertEqual(w.launch_operations_file.read_bytes(),original)
                self.assertIsNone(w.launch_selected.record['snapshotId'])

    def test_actual_pending_source_and_file_change_during_reply_hold_without_old_scan_resumption(self):
        for change in ('next-export','during-http'):
            with self.subTest(change=change),tempfile.TemporaryDirectory() as temporary:
                self.setUp()
                w,db,original=self.watcher(Path(temporary))
                w.launch_scan.request(dict(action='scan',id=str(self.at)+':99',scopeHash=self.control['scopeHash']),self.clock)
                call=w.worker.call
                def transport(method,path,body=None,retries=3):
                    if method=='POST':return call(method,path,body,retries)
                    if change=='during-http':
                        result=self.call()(method,path,retries)
                        w.sv_file.write_text('OlympusVerifyDB = {}')
                        return result
                    return self.call(lambda:(True,self.reply(retry=5)))(method,path,retries)
                w.worker.call=transport
                with patch.object(watcher.time,'time',lambda:self.clock),patch.object(watcher.time,'sleep'):
                    w.check_savedvars();w.pull_launch_operations()
                    self.assertEqual(w.launch_scan.phase,'idle')
                    self.assertEqual(w.launch_scan.calls,0)
                    if change=='next-export':
                        self.assertTrue(w.launch_selected.running)
                        self.clock+=2;db['roster']['exportedAt']=int(self.clock)
                        w.sv_file.write_text('OlympusVerifyDB='+launch._lua(db));w.state.d['sv_mtime']=0
                        w.check_savedvars();w.pull_launch_operations()
                    self.assertFalse(w.launch_selected.running);self.assertFalse(w.launch_selected.record['completed'])
                    self.assertEqual(w.launch_selected.record['stoppedReason'],'native-roster-changed-or-expired')
                    self.assertEqual(len(self.calls),1)
                    self.assertEqual(w.launch_operations_file.read_bytes(),original)

    def test_shared_gate_selection_to_legacy_preserves_five_second_gap(self):
        with tempfile.TemporaryDirectory() as temporary:
            w,db,original=self.watcher(Path(temporary))
            def sleep(seconds):self.clock+=seconds
            with patch.object(watcher.time,'time',lambda:self.clock),patch.object(watcher.time,'sleep',side_effect=sleep):
                w.check_savedvars();w.pull_launch_operations()
                finished=self.clock
                w.launch_scan.request(dict(action='scan',id=str(self.at)+':2',scopeHash=self.control['scopeHash']),self.clock)
                legacy_calls=[]
                def legacy(method,path,retries):legacy_calls.append(self.clock);return True,page(int(self.clock),started=self.at)
                w.worker.call=legacy;w.pull_launch_operations()
                self.assertEqual(legacy_calls,[])  # legacy bootstrap must not evade the cross-state gate
                self.clock=finished+5;w.pull_launch_operations()
                self.assertEqual(legacy_calls,[finished+5])

    def test_actual_v2_reservation_failure_retains_claim_and_cannot_resume(self):
        with tempfile.TemporaryDirectory() as temporary:
            w,db,original=self.watcher(Path(temporary))
            with patch.object(watcher.time,'time',lambda:self.clock),patch.object(w.state,'save',side_effect=OSError('synthetic private failure')):
                with self.assertRaises(watcher.CustodyStopped) as failed:
                    w.read_launch_control(db)
            self.assertTrue(failed.exception.__suppress_context__)
            self.assertTrue(w._custody_halted)
            self.assertTrue(w.state.was_seen('launch-control:'+self.control['guid']+':'+self.control['id']))
            self.assertIsNone(w.launch_selected.record)
            with patch.object(watcher.time,'time',lambda:self.clock):
                w.read_launch_control(db);w.pull_launch_operations()
            self.assertEqual(self.calls,[])
            self.assertFalse(w.launch_selected_file.exists())
            self.assertEqual(w.launch_operations_file.read_bytes(),original)

    def test_same_process_completed_49_page_history_is_exact_through_select_and_late_reload(self):
        with tempfile.TemporaryDirectory() as temporary:
            w,db,_=self.watcher(Path(temporary))
            pages=[page(self.at-10,i*20,963,self.at-20) for i in range(49)]
            for p in pages:p['snapshotAt']=self.at-20
            history=dict(version=2,controlId=str(self.at-20)+':9',scanComplete=True,running=False,stoppedReason=None,
                         discoveredPages=49,refreshedPages=11,pages=pages)
            original=launch.render_pages(history,self.at).encode()
            w.launch_operations_file.write_bytes(original)
            w.launch_scan.pages={p['entitlements']['offset']:p for p in pages}
            w.launch_scan.control_id=history['controlId'];w.launch_scan.complete=True
            w.launch_scan.calls=60;w.launch_scan.refreshed=11
            state=copy.deepcopy(w.launch_scan.__dict__)
            with patch.object(watcher.time,'time',lambda:self.clock),patch.object(watcher.time,'sleep'):
                w.check_savedvars();w.pull_launch_operations()
                self.assertTrue(w.launch_selected.record['completed'])
                selected_bytes=w.launch_selected_file.read_bytes()
                self.assertEqual(w.launch_scan.__dict__,state)
                self.assertEqual(w.launch_operations_file.read_bytes(),original)
                self.clock+=100;db['roster']['exportedAt']=int(self.clock);db['roster']['online']=2
                w.sv_file.write_text('OlympusVerifyDB='+launch._lua(db));w.state.d['sv_mtime']=0
                self.assertIsNone(w.valid_launch_control(db))  # Old control cannot admit another read.
                w.check_savedvars();w.pull_launch_operations()
                self.assertEqual(w.launch_scan.__dict__,state)
                self.assertEqual(w.launch_operations_file.read_bytes(),original)
                self.assertEqual(w.launch_selected_file.read_bytes(),selected_bytes)
                self.assertEqual(len(self.calls),1)
                # A genuinely newer legacy control retains the original strict
                # source-change behavior; selected history preservation is scoped.
                legacy=dict(version=1,action='recheck',id=str(int(self.clock))+':2',observedAt=int(self.clock),
                            scopeHash=self.control['scopeHash'],guid=self.control['guid'],offset=0)
                legacy['mac']=launch.control_mac('synthetic-secret',legacy);db['launchControl']=legacy
                self.clock+=1;db['roster']['exportedAt']=int(self.clock)
                w.sv_file.write_text('OlympusVerifyDB='+launch._lua(db));w.state.d['sv_mtime']=0
                w.check_savedvars()
                self.assertEqual(w.launch_scan.stopped,'native-roster-changed-or-expired')
                self.assertNotEqual(w.launch_operations_file.read_bytes(),original)

    def test_newer_legacy_controls_supersede_pending_selection_even_without_native_change(self):
        for action in ('scan','recheck','stop'):
            with self.subTest(action=action),tempfile.TemporaryDirectory() as temporary:
                self.setUp();w,db,original=self.watcher(Path(temporary))
                call=w.worker.call
                def limited(method,path,body=None,retries=3):
                    return call(method,path,body,retries) if method=='POST' else self.call(lambda:(True,self.reply(retry=5)))(method,path,retries)
                w.worker.call=limited
                with patch.object(watcher.time,'time',lambda:self.clock),patch.object(watcher.time,'sleep'):
                    w.check_savedvars();w.pull_launch_operations()
                    self.assertTrue(w.launch_selected.running)
                    legacy=dict(version=1,action=action,id=str(int(self.clock))+':2',observedAt=int(self.clock),
                                scopeHash=self.control['scopeHash'],guid=self.control['guid'],offset=0)
                    legacy['mac']=launch.control_mac('synthetic-secret',legacy);db['launchControl']=legacy
                    w.read_launch_control(db);w.pull_launch_operations()
                    self.assertFalse(w.launch_selected.running)
                    self.assertEqual(w.launch_selected.record['stoppedReason'],'operator-stopped' if action=='stop' else 'superseded')
                    self.assertEqual(len(self.calls),1)


if __name__=='__main__':unittest.main()

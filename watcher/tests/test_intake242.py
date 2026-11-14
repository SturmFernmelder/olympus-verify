"""Current-policy durable intake behavior using real Watcher custody and synthetic files."""
from __future__ import annotations
import copy
import hashlib
import hmac
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import watcher
import intake242
import intake_schema280

SECRET = "test-key"


def original(eid="a", kind="verify"):
    body=dict(id=eid,type=kind,source="native-whisper-event242",character="First Last",code="ABCDEF",guid="Player-1-ABCD",requestedAt=int(time.time()))
    if kind=="donation":
        body=dict(id=eid,type="donation",source=intake_schema280.V2,character="First Last",guid="Player-1-ABCD",requestedAt=int(time.time()),
                  requestedBy="Fern Melder",clientVersion="0.6.37",guild="OLYMPUS PRIME",realm="ForeverPvE",
                  donation=dict(version=2,kind="trade",copper=100,recipient="Fern Melder",collectorGuid="Player-1-CAFE",reference="TITHE-ABCD-EFGH"),
                  evidence=dict(kind="trade_complete_and_money_delta",confirmedLocal=True,automaticCredit=False,mac=""))
        body["evidence"]["mac"]=intake_schema280.tithe_mac(SECRET,body)
    body,digest=intake242._canonical_body(body)
    return dict(body=body,state="pending",attempted=False,sha256=digest)


def lua(value):
    if type(value) is dict:return "{"+",".join("["+lua(k)+"]="+lua(v) for k,v in value.items())+"}"
    if type(value) is list:return "{"+",".join(lua(v) for v in value)+"}"
    if value is None:return "nil"
    if type(value) is bool:return "true" if value else "false"
    return json.dumps(value,ensure_ascii=False)


class DurableIntake242Tests(unittest.TestCase):
    def watcher(self, rows, responses):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup);root=Path(temp.name)
        w=watcher.Watcher(dict(wow_dir=str(root),account="SYNTHETIC",worker_url="https://test.invalid",watcher_token="synthetic-token",
                               verify_secret=SECRET,officer_character="Fern Melder",state_file=str(root/"state.json")))
        w.state.d["intake242"]=rows;w.state.save();w.worker.calls=[];w.worker.paused=lambda:None
        replies=list(responses)
        def call(method,path,body=None,retries=3):
            w.worker.calls.append((method,path,copy.deepcopy(body),retries))
            return replies.pop(0) if replies else (False,{})
        w.worker.call=call
        return w
    def write(self,w,rows,filename="OlympusVerify.lua",dbname="OlympusVerifyDB",metadata=None):
        w.sv_file.parent.mkdir(parents=True,exist_ok=True)
        w.sv_file.with_name(filename).write_text(dbname+"="+lua(dict(intake242=dict(entries=rows,**({"bridgeMetadata":metadata} if metadata else {})))),encoding="utf-8")
    def terminal(self,status="done",guid=""):
        r=original();r.update(state=status,attempted=True,acknowledgedAt=int(time.time())-30,
                             receipt=dict(id="a",status=status,character="First Last",guid=guid,discordRole=""))
        return r
    def test_unknown_verification_is_preserved_without_second_attempt(self):
        r=original();body=copy.deepcopy(r["body"]);digest=r["sha256"];w=self.watcher({"a":r},[(False,"network")])
        intake242.drain(w,False);intake242.drain(w,False)
        self.assertEqual(len(w.worker.calls),1);self.assertEqual(r["state"],"outcome_unknown")
        self.assertEqual((r["body"],r["sha256"]),(body,digest));w.state.save()
        restarted=watcher.Watcher(w.cfg);calls=[];restarted.worker.paused=lambda:None;restarted.worker.call=lambda *a,**k:(calls.append(a) or (False,{}))
        intake242.drain(restarted,False);self.assertEqual(calls,[])
    def test_expired_source_goes_to_server_then_explicit_rejected_receipt(self):
        r=original();r["body"]["requestedAt"]=1;r["sha256"]=intake242._canonical_body(r["body"])[1]
        receipt=dict(id="a",character="First Last",guid="Player-1-ABCD",status="rejected",outcome="source_expired")
        w=self.watcher({"a":r},[(True,dict(version=242,acknowledgements=[receipt]))]);intake242.drain(w,False)
        self.assertEqual(w.worker.calls[0][2]["entries"][0]["requestedAt"],1);self.assertEqual(r["state"],"rejected")
        self.assertEqual(r["body"]["requestedAt"],1)
    def test_only_explicit_original_pre_effect_deferral_can_retry(self):
        r=original();body=copy.deepcopy(r["body"]);at=int(time.time())
        receipt=dict(id="a",character="First Last",guid="Player-1-ABCD",outcome="membership_source_pending",originalNoEffect=True)
        deferred=dict(version=242,acknowledgements=[],deferred=[receipt]);done=dict(version=242,acknowledgements=[dict(id="a",character="First Last",guid="Player-1-ABCD",status="done",outcome="member")])
        w=self.watcher({"a":r},[(True,deferred),(True,done)])
        with patch.object(intake242.time,"time",return_value=at):intake242.drain(w,False)
        with patch.object(intake242.time,"time",return_value=at+59):intake242.drain(w,False)
        self.assertEqual(len(w.worker.calls),1);self.assertFalse(r["retrySchedule280"]["spent"])
        with patch.object(intake242.time,"time",return_value=at+61):intake242.drain(w,False)
        self.assertEqual(len(w.worker.calls),2);self.assertEqual(r["state"],"done");self.assertTrue(r["retrySchedule280"]["spent"])
        self.assertEqual(r["body"],body);self.assertEqual(w.worker.calls[0][2],w.worker.calls[1][2])
    def test_incomplete_no_effect_receipt_and_restart_never_create_retry_authority(self):
        for restart in (False,True):
            r=original();at=int(time.time());receipt=dict(id="a",outcome="membership_source_pending",originalNoEffect=True)
            if restart:receipt.update(character="First Last",guid="Player-1-ABCD")
            w=self.watcher({"a":r},[(True,dict(version=242,acknowledgements=[],deferred=[receipt]))])
            with patch.object(intake242.time,"time",return_value=at):intake242.drain(w,False)
            if restart:
                w=watcher.Watcher(w.cfg);w.worker.calls=[];w.worker.paused=lambda:None;w.worker.call=lambda *a,**k:(w.worker.calls.append(a) or (False,{}))
            before=len(w.worker.calls)
            with patch.object(intake242.time,"time",return_value=at+61):intake242.drain(w,False)
            self.assertEqual(len(w.worker.calls),before)
    def test_unknown_receipt_cannot_remove_pending_source(self):
        r=original();body=copy.deepcopy(r["body"]);w=self.watcher({"a":r},[(True,dict(version=242,acknowledgements=[dict(id="other",character="First Last",guid="Player-1-ABCD",status="done")]))])
        intake242.drain(w,False);self.assertEqual(r["state"],"pending");self.assertTrue(r["attempted"]);self.assertEqual(r["body"],body)
    def test_batch_is_bounded_and_lost_donation_originals_never_repost(self):
        rows={f"{i:024x}":original(f"{i:024x}","donation") for i in range(30)};before=copy.deepcopy(rows)
        w=self.watcher(rows,[(False,"outage"),(True,dict(version=242,acknowledgements=[]))])
        intake242.drain(w,False);intake242.drain(w,False);intake242.drain(w,False)
        self.assertEqual([len(c[2]["entries"]) for c in w.worker.calls],[25,5])
        first={r["id"] for r in w.worker.calls[0][2]["entries"]};second={r["id"] for r in w.worker.calls[1][2]["entries"]}
        self.assertFalse(first&second);self.assertEqual(first|second,set(rows))
        for eid,r in rows.items():self.assertEqual((r["body"],r["sha256"]),(before[eid]["body"],before[eid]["sha256"]));self.assertTrue(r["attempted"])
    def test_receipt_time_is_original_and_mac_matches_addon_contract(self):
        r=self.terminal();at=r["acknowledgedAt"];w=self.watcher({"a":r},[])
        with patch.object(intake242.time,"time",return_value=at+1):receipt=intake242.receipts(w)[0]
        self.assertEqual((receipt["observedAt"],receipt["expiresAt"]),(at,at+86400))
        message=f"intake242|a|done||first last||{at}|{at+86400}"
        self.assertEqual(receipt["mac"],hmac.new(SECRET.encode(),message.encode(),hashlib.sha256).hexdigest()[:32])
        with patch.object(intake242.time,"time",return_value=at+86400):self.assertEqual(intake242.receipts(w),[])
        self.assertEqual(r["acknowledgedAt"],at)
    def test_terminal_receipt_expires_after_24h_and_48h_without_post_or_state_change(self):
        for status in ("done","rejected"):
            r=self.terminal(status);w=self.watcher({"a":r},[]);before=copy.deepcopy(w.state.d)
            with patch.object(w.state,"save",wraps=w.state.save) as save:
                for age in (86400,86401,172801):
                    with patch.object(intake242.time,"time",return_value=r["acknowledgedAt"]+age):
                        self.assertEqual(intake242.receipts(w),[]);intake242.drain(w,False)
                self.assertEqual(w.state.d,before);save.assert_not_called();self.assertEqual(w.worker.calls,[])
    def test_receipt_is_stable_within_original_ack_window_and_not_renewed(self):
        r=self.terminal();w=self.watcher({"a":r},[]);at=r["acknowledgedAt"]
        with patch.object(intake242.time,"time",return_value=at+1):first=intake242.receipts(w)
        with patch.object(intake242.time,"time",return_value=at+100):later=intake242.receipts(w)
        self.assertTrue(first);self.assertEqual(first,later);self.assertEqual(first[0]["expiresAt"],at+86400)
    def test_owned_source_conflict_holds_but_foreign_savedvariables_cannot_adopt_or_poison(self):
        w=self.watcher({},[]);body=original()["body"];self.write(w,{"a":body});intake242.collect(w)
        r=w.state.d["intake242"]["a"];before=copy.deepcopy(r);foreign={**body,"character":"Different"}
        self.write(w,{"a":foreign},"Olympus.lua","OlympusDB");intake242.collect(w);self.assertEqual(r,before)
        self.write(w,{"a":foreign});intake242.collect(w);self.assertTrue(r["sourceConflict"])
        self.assertEqual((r["body"],r["sha256"]),(before["body"],before["sha256"]))
        only=self.watcher({},[]);self.write(only,{"a":body},"Olympus.lua","OlympusDB");intake242.collect(only)
        self.assertEqual(only.state.d["intake242"],{})
    def test_bridge_metadata_is_not_adopted_and_cannot_hide_owned_body_drift(self):
        w=self.watcher({},[]);body=original()["body"];metadata={"a":dict(untrusted=True,origin="OlympusRecordDB-pendingRoleUpdates",automaticAuthority=False)}
        self.write(w,{"a":body},metadata=metadata);self.write(w,{"a":body},"OlympusRecord.lua","OlympusRecordDB");intake242.collect(w)
        self.assertNotIn("a",w.state.d["intake242"])
        self.write(w,{"a":body});intake242.collect(w);r=w.state.d["intake242"]["a"];r.update(state="outcome_unknown",attempted=True);before=copy.deepcopy(r)
        self.write(w,{"a":{**body,"character":"Changed Name"}},metadata=metadata);intake242.collect(w);self.assertEqual(r,before)
        self.write(w,{"a":{**body,"character":"Changed Name"}});intake242.collect(w)
        self.assertTrue(r["sourceConflict"]);self.assertEqual((r["state"],r["attempted"],r["body"],r["sha256"]),("outcome_unknown",True,before["body"],before["sha256"]))
    def test_exact_observation_only_suppresses_its_own_saved_event(self):
        r=original();r["body"].update(source="whisper",guid="Player-1-ABCD",observationId="a"*32,observedAt=100);r.update(state="outcome_unknown",attempted=True)
        w=self.watcher({"a":r},[]);same=dict(type="whisper",guid="Player-1-ABCD",observationId="a"*32,ts=100)
        self.assertTrue(intake242.handles_verify(w,"First Last","ABCDEF",same))
        self.assertFalse(intake242.handles_verify(w,"First Last","ABCDEF",{**same,"observationId":"b"*32,"ts":701}))
        self.assertFalse(intake242.handles_verify(w,"First Last","ABCDEF",None));self.assertEqual((r["state"],r["attempted"]),("outcome_unknown",True))
    def test_legacy_observation_matches_exact_missing_proof_time_not_all_uses_of_code(self):
        r=original();r["body"].pop("guid");r["body"].update(source="whisper",observedAt=100);r["sha256"]=intake242._canonical_body(r["body"])[1]
        r.update(state="rejected",attempted=True);w=self.watcher({"a":r},[])
        self.assertTrue(intake242.handles_verify(w,"First Last","ABCDEF",dict(type="whisper",ts=100)))
        self.assertFalse(intake242.handles_verify(w,"First Last","ABCDEF",dict(type="whisper",ts=701)))
        self.assertFalse(intake242.handles_verify(w,"First Last","ABCDEF",dict(type="whisper",ts=100,guid="Player-1-ABCD")));self.assertEqual(r["state"],"rejected")
    def test_receipt_none_guid_is_signed_as_empty_without_changing_original_receipt(self):
        r=self.terminal(guid=None);w=self.watcher({"a":r},[]);at=r["acknowledgedAt"]
        with patch.object(intake242.time,"time",return_value=at+1):receipt=intake242.receipts(w)[0]
        self.assertEqual(receipt["guid"],"");self.assertIsNone(r["receipt"]["guid"])
        message=f"intake242|a|done||first last||{at}|{at+86400}"
        self.assertEqual(receipt["mac"],hmac.new(SECRET.encode(),message.encode(),hashlib.sha256).hexdigest()[:32])


if __name__=="__main__":unittest.main()

"""Postdeployment regression coverage for .242. Authoring does not execute it."""
import copy
import hashlib
import hmac
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import sys

# Evergreen 12 Nov 2026 (CL2-023): moved from watcher/ into watcher/tests so `unittest discover -s watcher/tests`
# (the CI step) finds it with every other Watcher suite.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import intake242

class State:
    def __init__(self, rows):
        self.d = {"intake242":rows}
        self.saved = 0
    def save(self):
        self.saved += 1

class Worker:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []
    def paused(self):
        return False
    def call(self, method, path, body, retries):
        self.calls.append((method,path,copy.deepcopy(body),retries))
        return self.responses.pop(0)

def original(eid="a", kind="verify"):
    return {"body":{"id":eid,"type":kind,"character":"First Last","code":"ABCDEF","requestedAt":1},"state":"pending","attempted":False,"sha256":"original"}

class DurableIntake242Tests(unittest.TestCase):
    def watcher(self, rows, responses):
        return SimpleNamespace(state=State(rows),worker=Worker(responses),_custody_halted=False,secret="test-key")
    def test_unknown_verification_is_preserved_without_second_attempt(self):
        w=self.watcher({"a":original()},[(False,"network")])
        intake242.drain(w,False);intake242.drain(w,False)
        self.assertEqual(len(w.worker.calls),1)
        self.assertEqual(w.state.d["intake242"]["a"]["state"],"outcome_unknown")
        self.assertEqual(w.state.d["intake242"]["a"]["body"]["requestedAt"],1)
    def test_expired_source_goes_to_server_then_explicit_rejected_receipt(self):
        receipt={"id":"a","character":"First Last","status":"rejected","outcome":"source_expired"}
        w=self.watcher({"a":original()},[(True,{"version":242,"acknowledgements":[receipt]})])
        intake242.drain(w,False)
        self.assertEqual(w.worker.calls[0][2]["entries"][0]["requestedAt"],1)
        self.assertEqual(w.state.d["intake242"]["a"]["state"],"rejected")
    def test_only_explicit_original_pre_effect_deferral_can_retry(self):
        deferred={"version":242,"acknowledgements":[],"deferred":[{"id":"a","outcome":"membership_source_pending","originalNoEffect":True}]}
        done={"version":242,"acknowledgements":[{"id":"a","character":"First Last","status":"done","outcome":"member"}]}
        w=self.watcher({"a":original()},[(True,deferred),(True,done)])
        intake242.drain(w,False);intake242.drain(w,False)
        self.assertEqual(len(w.worker.calls),2)
        self.assertEqual(w.state.d["intake242"]["a"]["state"],"done")
    def test_unknown_receipt_cannot_remove_pending_source(self):
        w=self.watcher({"a":original()},[(True,{"version":242,"acknowledgements":[{"id":"other","character":"First Last","status":"done"}]})])
        intake242.drain(w,False)
        self.assertEqual(w.state.d["intake242"]["a"]["state"],"pending")
    def test_batch_is_bounded_and_donation_retry_keeps_original_id(self):
        rows={str(i):original(str(i),"donation") for i in range(30)}
        w=self.watcher(rows,[(False,"outage"),(True,{"version":242,"acknowledgements":[]})])
        intake242.drain(w,False);intake242.drain(w,False)
        self.assertEqual(len(w.worker.calls[0][2]["entries"]),25)
        self.assertEqual(w.worker.calls[0][2],w.worker.calls[1][2])
    def test_receipt_time_is_original_and_mac_matches_addon_contract(self):
        row=original();row.update(state="done",acknowledgedAt=100,receipt={"id":"a","status":"done","character":"First Last","guid":"","discordRole":""})
        w=self.watcher({"a":row},[])
        with patch.object(intake242.time,"time",return_value=101):
            receipt=intake242.receipts(w)[0]
        self.assertEqual(receipt["observedAt"],100)
        message="intake242|a|done||first last||100|86500"
        self.assertEqual(receipt["mac"],hmac.new(b"test-key",message.encode(),hashlib.sha256).hexdigest()[:32])
        with patch.object(intake242.time,"time",return_value=86500):
            renewed=intake242.receipts(w)[0]
        self.assertEqual((renewed["observedAt"],renewed["expiresAt"]),(100,172840))
    def test_terminal_receipt_renews_transport_after_24h_and_48h_without_post_or_state_change(self):
        for status in ("done","rejected"):
            row=original();row.update(state=status,attempted=True,acknowledgedAt=100,receipt={"id":"a","status":status,"character":"First Last","guid":"","discordRole":""})
            w=self.watcher({"a":row},[]);before=copy.deepcopy(w.state.d)
            for age in (86401,172801):
                at=100+age
                with patch.object(intake242.time,"time",return_value=at):
                    receipt=intake242.receipts(w)[0]
                    stable=intake242.receipts(w)[0]
                    intake242.drain(w,False)
                self.assertEqual(receipt,stable)
                self.assertEqual(receipt["observedAt"],100)
                expected=100+(age//86340)*86340+86400
                self.assertEqual(receipt["expiresAt"],expected)
                self.assertTrue(at<expected<=at+86400)
                message=f'intake242|a|{status}||first last||100|{expected}'
                self.assertEqual(receipt["mac"],hmac.new(b"test-key",message.encode(),hashlib.sha256).hexdigest()[:32])
                self.assertEqual(w.state.d,before)
                self.assertEqual((w.state.saved,w.worker.calls),(0,[]))
    def test_receipt_renewal_is_stable_within_original_ack_anchored_window(self):
        row=original();row.update(state="done",acknowledgedAt=100,receipt={"id":"a","status":"done","character":"First Last","guid":"","discordRole":""})
        w=self.watcher({"a":row},[])
        with patch.object(intake242.time,"time",return_value=86501):first=intake242.receipts(w)
        with patch.object(intake242.time,"time",return_value=90000):later=intake242.receipts(w)
        self.assertEqual(first,later)
        self.assertEqual(row["acknowledgedAt"],100)
    def test_dual_savedvariables_maps_share_id_and_conflicts_hold(self):
        with TemporaryDirectory() as directory:
            path=Path(directory)/"OlympusVerify.lua"
            path.write_text('OlympusVerifyDB = { intake242 = { entries = { ["a"] = { id="a", type="donation", character="First Last", requestedAt=1, }, }, }, }',encoding="utf-8")
            sibling=path.with_name("Olympus.lua")
            sibling.write_text('OlympusDB = { pendingRoleUpdates = { ["a"] = { id="a", type="donation", character="First Last", requestedAt=1, }, }, }',encoding="utf-8")
            w=self.watcher({},[]);w.sv_file=path
            intake242.collect(w)
            self.assertEqual(len(w.state.d["intake242"]),1)
            sibling.write_text('OlympusDB = { pendingRoleUpdates = { ["a"] = { id="a", type="donation", character="Different", requestedAt=1, }, }, }',encoding="utf-8")
            intake242.collect(w)
            self.assertTrue(w.state.d["intake242"]["a"]["sourceConflict"])
    def test_bridge_metadata_preserves_original_body_and_does_not_hide_body_drift(self):
        with TemporaryDirectory() as directory:
            path=Path(directory)/"OlympusVerify.lua"
            entry='{ id="a", type="donation", source="original-record", character="First Last", requestedAt=1, }'
            path.write_text('OlympusVerifyDB = { intake242 = { entries = { ["a"] = '+entry+' }, bridgeMetadata = { ["a"] = { untrusted=true, origin="OlympusRecordDB-pendingRoleUpdates", automaticAuthority=false, }, }, }, }',encoding="utf-8")
            sibling=path.with_name("OlympusRecord.lua")
            sibling.write_text('OlympusRecordDB = { pendingRoleUpdates = { ["a"] = '+entry+' }, }',encoding="utf-8")
            w=self.watcher({},[]);w.sv_file=path
            intake242.collect(w);row=w.state.d["intake242"]["a"]
            self.assertFalse(row.get("sourceConflict",False));self.assertTrue(row["bridgeUntrusted"])
            self.assertEqual(row["body"]["source"],"original-record");self.assertNotIn("bridgeUntrusted",row["body"])
            row.update(state="outcome_unknown",attempted=True);original_sha=row["sha256"]
            intake242.collect(w)
            self.assertEqual((row["state"],row["attempted"],row["sha256"]),("outcome_unknown",True,original_sha))
            sibling.write_text('OlympusRecordDB = { pendingRoleUpdates = { ["a"] = '+entry.replace('First Last','Changed Name')+' }, }',encoding="utf-8")
            intake242.collect(w)
            self.assertTrue(row["sourceConflict"]);self.assertEqual(row["sha256"],original_sha)
    def test_exact_observation_only_suppresses_its_own_saved_event(self):
        row=original();row["body"].update(source="whisper",guid="Player-1-ABCD",observationId="a"*32,observedAt=100)
        row.update(state="outcome_unknown",attempted=True)
        w=self.watcher({"a":row},[])
        same={"type":"whisper","guid":"Player-1-ABCD","observationId":"a"*32,"ts":100}
        self.assertTrue(intake242.handles_verify(w,"First Last","ABCDEF",same))
        self.assertFalse(intake242.handles_verify(w,"First Last","ABCDEF",{**same,"observationId":"b"*32,"ts":701}))
        self.assertFalse(intake242.handles_verify(w,"First Last","ABCDEF",None))
        self.assertEqual((row["state"],row["attempted"]),("outcome_unknown",True))
    def test_legacy_observation_matches_exact_missing_proof_time_not_all_uses_of_code(self):
        row=original();row["body"].update(source="whisper",observedAt=100)
        row.update(state="rejected",attempted=True);w=self.watcher({"a":row},[])
        self.assertTrue(intake242.handles_verify(w,"First Last","ABCDEF",{"type":"whisper","ts":100}))
        self.assertFalse(intake242.handles_verify(w,"First Last","ABCDEF",{"type":"whisper","ts":701}))
        self.assertFalse(intake242.handles_verify(w,"First Last","ABCDEF",{"type":"whisper","ts":100,"guid":"Player-1-ABCD"}))
        self.assertEqual(row["state"],"rejected")
    def test_receipt_none_guid_is_signed_as_empty_without_changing_original_receipt(self):
        row=original(kind="donation");row.update(state="done",acknowledgedAt=100,receipt={"id":"a","status":"done","character":"First Last","guid":None,"discordRole":""})
        w=self.watcher({"a":row},[])
        with patch.object(intake242.time,"time",return_value=101):r=intake242.receipts(w)[0]
        self.assertEqual(r["guid"],"");self.assertIsNone(row["receipt"]["guid"])
        self.assertEqual(r["mac"],hmac.new(b"test-key",b"intake242|a|done||first last||100|86500",hashlib.sha256).hexdigest()[:32])

if __name__ == "__main__":
    unittest.main()

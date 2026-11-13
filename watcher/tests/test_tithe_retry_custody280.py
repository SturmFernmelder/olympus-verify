"""Financial retries require an exact, source-owned pre-effect receipt; synthetic files only."""
from __future__ import annotations
import copy
import time
import unittest
from unittest.mock import patch
import test_tithe_policy280 as support


class TitheRetryCustodyTests(unittest.TestCase):
    def setUp(self):
        self.fixture = support.TithePolicyTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.w = self.fixture.w
        self.body = self.fixture.receipt()
        self.original = self.fixture.preserve(self.body)
        self.w.state.d["intake242"] = {self.body["id"]: self.original}

    def drain(self, at=None):
        with patch.object(support.intake242.time, "time", return_value=at or time.time()):
            support.intake242.drain(self.w, collect_inputs=False)

    def receipt(self):
        return {"id": self.body["id"], "character": self.body["character"], "guid": self.body["guid"],
                "observedAt": self.body["requestedAt"], "bodySHA256": self.original["sha256"],
                "outcome": "receipt_collector_pending", "originalNoEffect": True}

    def test_lost_financial_transport_never_reposts_next_pass_or_restart(self):
        calls = []
        def lost(*args, **kwargs):
            calls.append(copy.deepcopy(args)); return False, {}
        self.w.worker.call = lost
        self.drain(); self.drain()
        self.assertEqual(len(calls), 1, "an unknown financial attempt must not be automatically retried")
        self.assertTrue(self.original["attempted"])
        self.assertEqual(self.original["body"], self.body)
        self.assertEqual(self.original["state"], "outcome_unknown")
        replacement = support.watcher.Watcher(dict(wow_dir=str(self.fixture.path), account="SYNTHETIC", worker_url="https://test.invalid",
            watcher_token="synthetic-token", verify_secret=support.SECRET, officer_character="Fern Melder",
            state_file=str(self.fixture.path / "watcher.json")))
        replacement.worker.paused = lambda: None; replacement.worker.call = lost
        support.intake242.drain(replacement, collect_inputs=False)
        self.assertEqual(len(calls), 1)

    def test_exact_source_owned_no_effect_witness_is_spent_before_one_retry(self):
        calls=[]; at=int(time.time()); receipt=self.receipt()
        def transport(*args, **kwargs):
            calls.append(copy.deepcopy(args))
            if len(calls)==1:
                return True, {"version":242,"acknowledgements":[],"deferred":[receipt]}
            durable=self.w.state.path.read_text(encoding="utf-8")
            self.assertIn('"spent": true', durable)
            self.assertTrue(self.original["attempted"])
            return False, {}
        self.w.worker.call=transport
        self.drain(at); self.drain(at+59); self.assertEqual(len(calls),1)
        self.drain(at+61); self.drain(at+122)
        self.assertEqual(len(calls),2)
        self.assertEqual(self.original["body"],self.body)
        self.assertEqual(self.original["sha256"],support.intake242._canonical_body(self.body)[1])
        self.assertTrue(self.original["attempted"])
        self.assertEqual(self.original["state"],"outcome_unknown")

    def test_unbound_or_changed_receipt_never_authorizes_another_financial_attempt(self):
        cases=[{}, {"originalNoEffect":False}, {"bodySHA256":"0"*64}, {"character":"Other Sender"},
               {"guid":"Player-1-AAAA"}, {"observedAt":self.body["requestedAt"]+1}, {"unexpected":True}]
        for change in cases:
            with self.subTest(change=change):
                row=self.fixture.preserve(self.body);self.w.state.d["intake242"]={self.body["id"]:row}
                receipt=self.receipt()
                if not change:
                    receipt={"id":self.body["id"],"outcome":"receipt_collector_pending"}
                else:receipt.update(change)
                calls=[]
                def transport(*args,**kwargs):
                    calls.append(args);return True,{"version":242,"acknowledgements":[],"deferred":[receipt]}
                self.w.worker.call=transport
                self.drain();self.drain(int(time.time())+61)
                self.assertEqual(len(calls),1)
                self.assertTrue(row["attempted"])
                self.assertEqual(row["body"],self.body)

    def test_reloaded_unspent_metadata_is_not_adopted_as_a_source_owned_receipt(self):
        at=int(time.time());self.fixture.response={"version":242,"acknowledgements":[],"deferred":[self.receipt()]}
        self.drain(at)
        replacement = support.watcher.Watcher(dict(wow_dir=str(self.fixture.path), account="SYNTHETIC", worker_url="https://test.invalid",
            watcher_token="synthetic-token", verify_secret=support.SECRET, officer_character="Fern Melder",
            state_file=str(self.fixture.path / "watcher.json")))
        calls=[];replacement.worker.paused=lambda:None;replacement.worker.call=lambda *a,**k:(calls.append(a) or (False,{}))
        with patch.object(support.intake242.time,"time",return_value=at+61):
            support.intake242.drain(replacement,collect_inputs=False)
        self.assertEqual(calls,[])

    def test_no_effect_receipt_cannot_authorize_changed_original(self):
        at=int(time.time());self.fixture.response={"version":242,"acknowledgements":[],"deferred":[self.receipt()]}
        self.drain(at);self.original["body"]["donation"]["copper"]+=1
        self.drain(at+61)
        self.assertEqual(len(self.fixture.calls),1)

    def test_retry_spend_save_failure_stops_before_dispatch_and_preserves_original(self):
        at=int(time.time());self.fixture.response={"version":242,"acknowledgements":[],"deferred":[self.receipt()]}
        self.drain(at)
        with patch.object(self.w.state,"save",side_effect=OSError("synthetic custody unavailable")):
            with self.assertRaises(OSError):self.drain(at+61)
        self.assertEqual(len(self.fixture.calls),1)
        self.assertTrue(self.w._custody_halted)
        self.assertTrue(self.original["attempted"])
        self.assertEqual(self.original["body"],self.body)

    def test_unknown_financial_original_does_not_block_later_new_verification(self):
        self.w.worker.call=lambda *a,**k:(False,{})
        self.drain()
        later=self.fixture.verify("later-fresh")
        self.w.state.d["intake242"][later["id"]]=self.fixture.preserve(later)
        calls=[]
        self.w.worker.call=lambda *a,**k:(calls.append(copy.deepcopy(a)) or (False,{}))
        self.drain()
        self.assertEqual(len(calls),1)
        self.assertEqual(calls[0][2]["entries"],[later])
        self.assertEqual(self.original["state"],"outcome_unknown")


if __name__ == "__main__":
    unittest.main()

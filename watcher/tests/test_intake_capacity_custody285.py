"""Capacity deferral is exact original no-dispatch custody, never a generic retry."""
from __future__ import annotations
import copy
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
if os.environ.get("WATCHER_TEST_SOURCE"):
    sys.path.insert(0, os.environ["WATCHER_TEST_SOURCE"])
import intake242
import test_intake242 as support


class IntakeCapacityCustody285(unittest.TestCase):
    def setUp(self):
        self.support = support.DurableIntake242Tests()
        self.addCleanup(self.support.doCleanups)
        self.at = int(time.time())

    def row(self, kind="verify", eid="capacity-original"):
        if kind == "donation":
            eid = hashlib.sha256(eid.encode("utf-8")).hexdigest()[:24]
        row = support.original(eid, kind)
        row["body"]["requestedAt"] = self.at
        if kind == "donation":
            row["body"]["evidence"]["mac"] = support.intake_schema280.tithe_mac(support.SECRET, row["body"])
        row["sha256"] = intake242._canonical_body(row["body"])[1]
        return row

    def watcher(self, rows, replies=()):
        return self.support.watcher(rows, replies)

    def drain(self, w, after=0):
        with patch.object(intake242.time, "time", return_value=self.at + after):
            intake242.drain(w, collect_inputs=False)

    @staticmethod
    def receipt(row):
        body = row["body"]
        return dict(id=body["id"], character=body["character"], guid=body.get("guid", ""),
                    bodySHA256=row["sha256"], outcome="intake_capacity_pending285", originalNoEffect=True)

    def test_actual_mixed_response_defers_only_unprocessed_originals_and_spends_before_retry(self):
        completed = self.row(eid="processed")
        ordinary, financial = self.row(eid="unprocessed-role"), self.row("donation", "unprocessed-tithe")
        rows = {r["body"]["id"]: r for r in (completed, ordinary, financial)}
        bodies = {key: copy.deepcopy((row["body"], row["sha256"])) for key, row in rows.items()}
        ack = dict(id="processed", character=completed["body"]["character"], guid=completed["body"]["guid"], status="done", outcome="member")
        w = self.watcher(rows)
        calls = []
        def transport(method, path, payload, retries):
            calls.append(copy.deepcopy(payload))
            self.assertEqual(payload["transportCapability"], "late-whisper-capacity285-v1")
            self.assertEqual(set(payload), {"entries", "transportCapability"})
            self.assertEqual(retries, 1)
            if len(calls) == 1:
                return True, dict(version=242, acknowledgements=[ack], deferred=[self.receipt(ordinary), self.receipt(financial)])
            durable = json.loads(w.state.path.read_text(encoding="utf-8"))["intake242"]
            for row in (ordinary, financial):
                self.assertTrue(row["attempted"])
                self.assertTrue(row["retrySchedule280"]["spent"])
                self.assertTrue(durable[row["body"]["id"]]["retrySchedule280"]["spent"])
            return False, {}
        w.worker.call = transport
        self.drain(w); completed_after = copy.deepcopy(completed)
        self.drain(w, 4); self.assertEqual(len(calls), 1)
        self.drain(w, 5); self.drain(w, 10)
        self.assertEqual(len(calls), 2)
        self.assertEqual({r["id"] for r in calls[1]["entries"]}, {ordinary["body"]["id"], financial["body"]["id"]})
        self.assertEqual(completed, completed_after)
        for key, row in rows.items():
            self.assertEqual((row["body"], row["sha256"]), bodies[key])
        for row in (ordinary, financial):
            self.assertEqual(row["state"], "outcome_unknown")
            self.assertNotIn("collectorRetry280", row, "capacity does not mint a collector witness")

    def test_inexact_or_wrong_purpose_receipts_never_authorize_a_retry(self):
        changes = [dict(bodySHA256="0" * 64), dict(bodySHA256=True), dict(bodySHA256="A" * 64),
                   dict(character="Other Sender"), dict(guid="Player-1-CAFE"), dict(id="other"),
                   dict(originalNoEffect=1), dict(outcome="membership_source_pending"),
                   dict(outcome="approved_branch_authority_pending"), dict(observedAt=self.at), dict(extra=True)]
        for kind in ("verify", "donation"):
            for change in changes + [None]:
                with self.subTest(kind=kind, change=change):
                    row = self.row(kind); original = copy.deepcopy((row["body"], row["sha256"]))
                    receipt = self.receipt(row)
                    if change is None: del receipt["bodySHA256"]
                    else: receipt.update(change)
                    w = self.watcher({row["body"]["id"]: row}, [(True, dict(version=242, acknowledgements=[], deferred=[receipt]))])
                    self.drain(w); self.drain(w, 6)
                    self.assertEqual(len(w.worker.calls), 1)
                    self.assertNotIn("retrySchedule280", row)
                    self.assertEqual((row["body"], row["sha256"]), original)

    def test_membership_deferral_keeps_60_seconds_and_cannot_retry_a_financial_original(self):
        ordinary = self.row()
        pending = {key: value for key, value in self.receipt(ordinary).items() if key != "bodySHA256"}
        pending["outcome"] = "membership_source_pending"
        ordinary_watcher = self.watcher({ordinary["body"]["id"]: ordinary}, [(True, dict(version=242, acknowledgements=[], deferred=[pending]))])
        self.drain(ordinary_watcher); self.drain(ordinary_watcher, 5); self.drain(ordinary_watcher, 59)
        self.assertEqual(len(ordinary_watcher.worker.calls), 1)
        self.drain(ordinary_watcher, 60)
        self.assertEqual(len(ordinary_watcher.worker.calls), 2)
        row = self.row("donation")
        receipt = {key: value for key, value in self.receipt(row).items() if key != "bodySHA256"}
        receipt["outcome"] = "membership_source_pending"
        w = self.watcher({row["body"]["id"]: row}, [(True, dict(version=242, acknowledgements=[], deferred=[receipt]))])
        self.drain(w); self.drain(w, 61)
        self.assertEqual(len(w.worker.calls), 1)
        self.assertNotIn("retrySchedule280", row)
        self.assertNotIn("collectorRetry280", row)

    def test_restart_cannot_adopt_serialized_capacity_receipt(self):
        for kind in ("verify", "donation"):
            with self.subTest(kind=kind):
                row = self.row(kind)
                w = self.watcher({row["body"]["id"]: row}, [(True, dict(version=242, acknowledgements=[], deferred=[self.receipt(row)]))])
                self.drain(w)
                self.assertIn("retrySchedule280", row)
                self.assertFalse(row["retrySchedule280"]["spent"])
                restarted = support.watcher.Watcher(w.cfg)
                calls = []; restarted.worker.paused = lambda: None
                restarted.worker.call = lambda *a, **k: (calls.append(a) or (False, {}))
                self.drain(restarted, 6)
                self.assertEqual(calls, [])
                retained = restarted.state.d["intake242"][row["body"]["id"]]
                self.assertEqual((retained["body"], retained["sha256"], retained["attempted"]), (row["body"], row["sha256"], True))

    def test_delivery_binding_changed_during_or_after_response_stays_held(self):
        for during in (False, True):
            with self.subTest(during=during):
                row = self.row(); w = self.watcher({row["body"]["id"]: row}); calls = []
                def transport(*args, **kwargs):
                    calls.append(args)
                    if during: w.worker.token = "synthetic-other-token"
                    return True, dict(version=242, acknowledgements=[], deferred=[self.receipt(row)])
                w.worker.call = transport; self.drain(w)
                if not during: w.worker.token = "synthetic-other-token"
                self.drain(w, 61)
                self.assertEqual(len(calls), 1)
                if during: self.assertNotIn("retrySchedule280", row)

    def test_receipt_cannot_bind_a_replaced_record_or_changed_source_during_call(self):
        for change in ("replaced", "source-conflict", "body", "unknown", "rejected", "retired"):
            with self.subTest(change=change):
                row = self.row(); key = row["body"]["id"]; w = self.watcher({key: row}); calls = []
                receipt = self.receipt(row)
                def transport(*args, **kwargs):
                    calls.append(args)
                    if change == "replaced": w.state.d["intake242"][key] = copy.deepcopy(row)
                    elif change == "source-conflict": row["sourceConflict"] = True
                    elif change == "body":
                        row["body"]["code"] = "XYZ234"; row["sha256"] = intake242._canonical_body(row["body"])[1]
                    elif change == "retired": w._local_correspondence_blocked280 = frozenset({key})
                    else: row["state"] = change
                    return True, dict(version=242, acknowledgements=[], deferred=[receipt])
                w.worker.call = transport; self.drain(w); self.drain(w, 61)
                self.assertEqual(len(calls), 1)
                self.assertNotIn("retrySchedule280", row)
                self.assertNotIn("retrySchedule280", w.state.d["intake242"][key])
                if change in ("unknown", "rejected"): self.assertEqual(row["state"], change)

    def test_existing_unknown_or_rejected_rows_remain_byte_identical(self):
        for state in ("outcome_unknown", "unknown", "rejected"):
            with self.subTest(state=state):
                row = self.row("donation"); row.update(state=state, attempted=True)
                row["retrySchedule280"] = dict(spent=False, nextAt=1, receipt=self.receipt(row))
                before = copy.deepcopy(row)
                w = self.watcher({row["body"]["id"]: row}); self.drain(w); self.drain(w, 61)
                self.assertEqual(w.worker.calls, [])
                self.assertEqual(row, before)

    def test_spend_save_failure_halts_before_retry(self):
        row = self.row("donation")
        w = self.watcher({row["body"]["id"]: row}, [(True, dict(version=242, acknowledgements=[], deferred=[self.receipt(row)]))])
        self.drain(w)
        self.assertIn("retrySchedule280", row)
        before = copy.deepcopy((row["body"], row["sha256"]))
        with patch.object(w.state, "save", side_effect=OSError("synthetic custody unavailable")):
            with self.assertRaises(OSError): self.drain(w, 61)
        self.assertTrue(w._custody_halted)
        self.assertEqual(len(w.worker.calls), 1)
        self.assertTrue(row["retrySchedule280"]["spent"])
        self.assertEqual((row["body"], row["sha256"]), before)

    def test_modified_schedule_or_original_after_response_has_no_retry_witness(self):
        for change in ("schedule", "source", "retired"):
            with self.subTest(change=change):
                row = self.row(); w = self.watcher({row["body"]["id"]: row}, [(True, dict(version=242, acknowledgements=[], deferred=[self.receipt(row)]))])
                self.drain(w)
                self.assertIn("retrySchedule280", row)
                if change == "schedule": row["retrySchedule280"]["nextAt"] = 0
                elif change == "source": row["sourceConflict"] = True
                else: w._local_correspondence_blocked280 = frozenset({row["body"]["id"]})
                self.drain(w, 61)
                self.assertEqual(len(w.worker.calls), 1)


if __name__ == "__main__": unittest.main()

"""Historical journal custody and retired-v1 ingress. No client or network.

Fixtures explicitly provision old journal originals. A valid old signature never
authorizes a new v1 capture, upgrades it to TITHE v2 or resolves a staged outcome.
"""
from __future__ import annotations

import json
import io
import sys
import tempfile
import time
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import watcher
import treasury_receipts227 as treasury

SECRET = "only-a-local-test-key"


class TreasuryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.at = int(time.time())
        self.journal = treasury.TreasuryJournal(self.root / "receipts.json")

    def tearDown(self):
        self.tmp.cleanup()

    def event(self, **changes):
        row = dict(version=1, id="a" * 24, ts=self.at, kind="trade", incomingCopper=10_000, outgoingCopper=0, sender="Aelin Stormwarden-RealmOne", recipient="Fern Melder")
        row.update(changes)
        row["mac"] = treasury.receipt_mac(SECRET, row)
        return row

    def note(self, row):
        return f"Olympus: gold {row['kind']} {row['incomingCopper']} paid {row['outgoingCopper']} from {row['sender']} (id {row['id']}, ts {row['ts']}, ref OLVt-{row['mac']})"

    def rows(self):
        return json.loads(self.journal.path.read_text())["receipts"]

    def historical_data(self, *events, source="signed-chat", recorded_at=None):
        """Provision the actual old stored shape, not prospective record()."""
        rows = {}
        for event in events:
            decoded = treasury.validated_receipt(event, SECRET, "Fern Melder", self.at)
            self.assertIsNotNone(decoded)
            canonical = {key: value for key, value in decoded.items() if key != "mac"}
            rows[event["id"]] = {**canonical, "classification": "unclassified_receipt", "netCopper": decoded["incomingCopper"] - decoded["outgoingCopper"], "firstSource": source, "recordedAt": self.at if recorded_at is None else recorded_at, "retainUntil": decoded["ts"] + 30 * 86400}
        return {"version": 1, "classification": "unclassified_receipts", "receipts": rows}

    def seed_history(self, *events, journal=None):
        journal = self.journal if journal is None else journal
        journal._write(self.historical_data(*events))
        return journal.path.read_bytes()

    def test_real_signature_historical_restart_and_fallback_deduplicate(self):
        row = self.event()
        note = treasury.parse_note(self.note(row), row["recipient"])
        self.assertEqual(treasury.validated_receipt(note, SECRET, "Fern Melder", self.at), treasury.validated_receipt(row, SECRET, "Fern Melder", self.at))
        self.assertEqual(self.journal.record(note, SECRET, "signed-chat", self.at), "policy-held")
        self.assertFalse(self.journal.path.exists())
        original = self.seed_history(row)
        again = treasury.TreasuryJournal(self.journal.path)
        self.assertEqual(again.record(row, SECRET, "savedvariables", self.at), "duplicate")
        self.assertEqual(again.path.read_bytes(), original)
        self.assertEqual(len(self.rows()), 1)
        stored = next(iter(self.rows().values()))
        self.assertEqual(stored["classification"], "unclassified_receipt")
        self.assertNotIn("mac", stored)
        self.assertNotIn("discordId", stored)

    def test_distinct_historical_payments_same_payer_amount_time_are_not_collapsed(self):
        original = self.seed_history(self.event(), self.event(id="b" * 24))
        for receipt_id in ("a" * 24, "b" * 24):
            self.assertEqual(self.journal.record(self.event(id=receipt_id), SECRET, "savedvariables", self.at), "duplicate")
        self.assertEqual(len(self.rows()), 2)
        self.assertEqual(self.journal.path.read_bytes(), original)

    def test_full_realm_suffix_and_two_part_recipient_are_bound(self):
        row = self.event()
        row["sender"] = row["sender"].replace("RealmOne", "RealmTwo")
        self.assertEqual(self.journal.record(row, SECRET, "savedvariables", self.at), "refused")
        self.assertEqual(self.journal.record(self.event(recipient="Fernmelder"), SECRET, "savedvariables", self.at), "refused")
        self.assertEqual(self.journal.record(self.event(recipient="Fern Melder-AnotherRealm"), SECRET, "savedvariables", self.at), "refused")

    def test_invalid_amounts_types_clock_and_auth_fail_without_file(self):
        for changes in ({"incomingCopper": 0}, {"incomingCopper": -1}, {"incomingCopper": True}, {"incomingCopper": treasury.MAX_COPPER + 1}, {"outgoingCopper": -1}, {"outgoingCopper": 0.5}, {"ts": self.at + 6}, {"ts": self.at - 30 * 86400}, {"kind": "seen_mail"}, {"version": True}):
            self.assertEqual(self.journal.record(self.event(**changes), SECRET, "savedvariables", self.at), "refused", changes)
        self.assertEqual(self.journal.record(self.event(), "wrong-key", "savedvariables", self.at), "refused")
        self.assertFalse(self.journal.path.exists())

    def test_mixed_trade_is_never_described_as_a_donation(self):
        event = self.event(outgoingCopper=20_000)
        self.assertEqual(self.journal.record(event, SECRET, "signed-chat", self.at), "policy-held")
        self.assertFalse(self.journal.path.exists())
        self.seed_history(event)
        row = next(iter(self.rows().values()))
        self.assertEqual((row["incomingCopper"], row["outgoingCopper"], row["netCopper"]), (10_000, 20_000, -10_000))
        self.assertEqual(row["classification"], "unclassified_receipt")

    def test_cod_or_paid_mail_is_not_accepted(self):
        self.assertEqual(self.journal.record(self.event(kind="mail", outgoingCopper=100), SECRET, "savedvariables", self.at), "refused")

    def test_conflicting_signed_original_does_not_replace_existing(self):
        original = self.seed_history(self.event())
        with self.assertRaisesRegex(ValueError, "conflicts"):
            self.journal.record(self.event(incomingCopper=50_000), SECRET, "savedvariables", self.at)
        self.assertEqual(original, self.journal.path.read_bytes())

    def test_failed_atomic_storage_commit_preserves_original_and_exact_recovery(self):
        original = self.seed_history(self.event())
        row = self.event(id="c" * 24)
        historical = self.historical_data(self.event(), row)
        with patch.object(treasury.os, "replace", side_effect=OSError("test failure")):
            with self.assertRaises(OSError):
                self.journal._write(historical)
        self.assertEqual(self.journal.path.read_bytes(), original)
        staged = self.journal._staged_path().read_bytes()
        with self.assertRaisesRegex(ValueError, "staged"):
            self.journal.record(row, SECRET, "savedvariables", self.at)
        self.assertEqual(self.journal._staged_path().read_bytes(), staged)
        # Only the low-level exact frozen storage primitive is exercised here;
        # production record() must never auto-complete unknown historical writes.
        self.journal._write(historical)
        self.assertFalse(self.journal._staged_path().exists())
        self.assertEqual(self.journal.record(row, SECRET, "savedvariables", self.at), "duplicate")

    def test_pending_first_commit_cannot_be_overwritten_by_another_receipt(self):
        original = self.event()
        historical = self.historical_data(original)
        with patch.object(treasury.os, "replace", side_effect=OSError("test crash after staging")):
            with self.assertRaises(OSError):
                self.journal._write(historical)
        staged = self.journal.path.with_suffix(".json.tmp")
        frozen = staged.read_bytes()
        self.assertFalse(self.journal.path.exists())
        with self.assertRaisesRegex(ValueError, "staged"):
            self.journal.record(self.event(id="b" * 24), SECRET, "savedvariables", self.at)
        self.assertEqual(staged.read_bytes(), frozen)
        self.assertFalse(self.journal.path.exists())
        # Even a valid same-original recorder call stays held. Explicit storage
        # primitive recovery accepts only the already frozen byte-identical data.
        with self.assertRaisesRegex(ValueError, "staged"):
            self.journal.record(original, SECRET, "savedvariables", self.at)
        self.assertEqual(staged.read_bytes(), frozen)
        self.journal._write(historical)
        self.assertFalse(staged.exists())
        self.assertEqual(list(self.rows()), [original["id"]])

    def test_staged_retry_cannot_change_its_original_metadata(self):
        self.seed_history(self.event())
        next_row = self.event(id="b" * 24)
        historical = self.historical_data(self.event(), next_row)
        with patch.object(treasury.os, "replace", side_effect=OSError("test staged write")):
            with self.assertRaises(OSError):
                self.journal._write(historical)
        staged = self.journal.path.with_suffix(".json.tmp")
        frozen, committed = staged.read_bytes(), self.journal.path.read_bytes()
        with self.assertRaisesRegex(ValueError, "staged"):
            self.journal.record(next_row, SECRET, "savedvariables", self.at + 1)
        changed = self.historical_data(self.event(), next_row, recorded_at=self.at + 1)
        with self.assertRaisesRegex(ValueError, "staged"):
            self.journal._write(changed)
        self.assertEqual(staged.read_bytes(), frozen)
        self.assertEqual(self.journal.path.read_bytes(), committed)
        self.journal._write(historical)
        self.assertEqual(self.journal.record(next_row, SECRET, "savedvariables", self.at), "duplicate")

    def test_partial_staged_original_is_never_silently_replaced(self):
        staged = self.journal.path.with_suffix(".json.tmp")
        frozen = b'{"version":1,"private-original":"incomplete'
        staged.write_bytes(frozen)
        with self.assertRaisesRegex(ValueError, "staged"):
            self.journal.record(self.event(), SECRET, "savedvariables", self.at)
        self.assertEqual(staged.read_bytes(), frozen)
        self.assertFalse(self.journal.path.exists())

    def test_quiet_retention_holds_unknown_staged_original(self):
        staged = self.journal.path.with_suffix(".json.tmp")
        frozen = b'{"private-original":"pending-attended-recovery"}'
        staged.write_bytes(frozen)
        with self.assertRaisesRegex(ValueError, "staged"):
            self.journal.purge(self.at + 31 * 86400)
        self.assertEqual(staged.read_bytes(), frozen)

    def test_unreadable_journal_is_never_silently_recreated(self):
        self.journal.path.write_text("invalid original")
        with self.assertRaisesRegex(ValueError, "unreadable"):
            self.journal.record(self.event(), SECRET, "signed-chat", self.at)
        self.assertEqual(self.journal.path.read_text(), "invalid original")

    def test_retention_purge_does_not_require_new_payments_and_cannot_resurrect(self):
        self.seed_history(self.event())
        self.assertEqual(self.journal.purge(self.at + 30 * 86400), 1)
        self.assertEqual(self.rows(), {})
        self.assertEqual(self.journal.record(self.event(), SECRET, "savedvariables", self.at + 30 * 86400), "refused")

    def test_capacity_never_evicts_an_unexpired_receipt(self):
        original = self.seed_history(self.event())
        with patch.object(treasury, "MAX_ROWS", 1):
            self.assertEqual(self.journal.record(self.event(id="d" * 24), SECRET, "savedvariables", self.at), "policy-held")
        self.assertEqual(self.journal.path.read_bytes(), original)
        self.assertEqual(len(self.rows()), 1)
        # Restored over-bound historical data is held rather than evicted or reset.
        self.seed_history(self.event(), self.event(id="b" * 24))
        over_bound = self.journal.path.read_bytes()
        with patch.object(treasury, "MAX_ROWS", 1):
            with self.assertRaisesRegex(ValueError, "invalid treasury journal"):
                self.journal.record(self.event(), SECRET, "signed-chat", self.at)
        self.assertEqual(self.journal.path.read_bytes(), over_bound)

    def make_watcher(self):
        return watcher.Watcher(dict(wow_dir=str(self.root), account="LOCAL_TEST", worker_url="https://test.invalid", watcher_token="not-a-token", verify_secret=SECRET, officer_character="Fern Melder", state_file=str(self.root / "watcher.json")))

    def test_watcher_rejects_spoof_and_holds_new_own_v1_without_network(self):
        w = self.make_watcher()
        row = self.event()
        w.worker.call = lambda *args, **kwargs: self.fail("Treasury capture must not call a provider")
        with patch.object(w.treasury, "record", wraps=w.treasury.record) as record:
            w.handle_chat_line("11/3 10:00:00.000  Stranger whispers: " + self.note(row))
            record.assert_not_called()
            self.assertFalse(w.treasury.path.exists())
            w.handle_chat_line("11/3 10:00:00.000  To Fern Melder: " + self.note(row))
            record.assert_called_once()
            self.assertFalse(w.treasury.path.exists())
        historical = self.seed_history(row, journal=w.treasury)
        w.handle_chat_line("11/3 10:00:00.000  To Fern Melder: " + self.note(row))
        self.assertEqual(w.treasury.path.read_bytes(), historical)

    def test_watcher_disk_failure_stops_before_chat_cursor_advances(self):
        w = self.make_watcher()
        row = self.event()
        historical = self.seed_history(row, journal=w.treasury)
        w.worker.call = lambda *args, **kwargs: self.fail("Treasury history must stay local")
        w.chat_log.parent.mkdir(parents=True)
        w.chat_log.write_text("filler\n" * 100)
        w.tail_chat_log()
        before = w.state.d["chat_offset"]
        with w.chat_log.open("a") as stream:
            stream.write("11/3 10:00:00.000  To Fern Melder: " + self.note(row) + "\n")
        with patch.object(w.treasury, "record", side_effect=OSError("private sender must not leak")):
            with self.assertRaisesRegex(watcher.NoCustody, "source retained"):
                w.tail_chat_log()
        self.assertEqual(w.state.d["chat_offset"], before)
        w.tail_chat_log()
        self.assertGreater(w.state.d["chat_offset"], before)
        self.assertEqual(w.treasury.path.read_bytes(), historical)

    def test_savedvariables_v1_history_deduplicates_but_new_capture_stays_held(self):
        w = self.make_watcher()
        row = self.event()
        historical = self.seed_history(row, journal=w.treasury)
        row.update(status="confirmed_local", classification="unclassified_receipt")
        observed = self.event(id="e" * 24)
        observed.update(status="not_credited", classification="unclassified_receipt")
        prospective = self.event(id="f" * 24)
        prospective.update(status="confirmed_local", classification="unclassified_receipt")
        def lua(value):
            if isinstance(value, dict):
                return "{" + ",".join("[" + json.dumps(k) + "]=" + lua(v) for k, v in value.items()) + "}"
            if isinstance(value, list):
                return "{" + ",".join(lua(v) for v in value) + "}"
            return json.dumps(value)
        w.sv_file.parent.mkdir(parents=True)
        w.sv_file.write_text("OlympusVerifyDB = " + lua({"treasury": {"receipts": [row, observed, prospective]}}))
        w.worker.call = lambda *args, **kwargs: self.fail("Capture must stay local")
        with patch.object(watcher.time, "sleep"):
            w.check_savedvars()
        self.assertEqual(w.treasury.path.read_bytes(), historical)
        w.handle_chat_line("11/3 10:00:00.000  To Fern Melder: " + self.note(row))
        self.assertEqual(w.treasury.path.read_bytes(), historical)
        self.assertEqual(w.treasury.record(self.event(id="f" * 24), SECRET, "savedvariables", self.at), "policy-held")
        self.assertEqual(w.treasury.path.read_bytes(), historical)

    def refusal(self, **changes):
        body = dict(result="membership_not_confirmed", error="private-body-marker", roleGranted=False, inviteQueued=False, pendingConsumed=True, requestRefused=True)
        body.update(changes)
        return urllib.error.HTTPError("https://test.invalid/ingest/verify", 409, "Conflict", {}, io.BytesIO(json.dumps(body).encode()))

    def test_closed_membership_refusal_settles_original_without_blocking_other_applicants(self):
        w = self.make_watcher()
        with patch.object(w.worker.opener, "open", side_effect=[self.refusal(), io.BytesIO(b'{"result":"ok"}')]), patch("sys.stdout", new_callable=io.StringIO) as output:
            first = w._post_claimed("/ingest/verify", {"character": "Aelin Stormwarden", "code": "TESTKEY", "source": "whisper"}, "test-original", ["t:TESTKEY"])
            self.assertIs(first, watcher.Delivery.DELIVERED)
            self.assertTrue(w.state.was_seen("t:TESTKEY"), "No automatic replay of the refused code")
            self.assertEqual(w.state.d["outbox"], [])
            self.assertIs(w.post("/ingest/events", {"events": []}, "different-original"), watcher.Delivery.DELIVERED)
            self.assertNotIn("private-body-marker", output.getvalue())

    def test_partial_or_unknown_refusal_remains_held(self):
        for change in ({"pendingConsumed": False}, {"roleGranted": True}, {"requestRefused": 1}, {"result": "outcome_unknown"}, {"additional": True}):
            worker = watcher.Worker("https://test.invalid", "test-token")
            with patch.object(worker.opener, "open", side_effect=self.refusal(**change)):
                okay, result = worker.call("POST", "/ingest/verify", {}, retries=1)
            self.assertTrue(okay)
            self.assertIsNone(result)
            self.assertEqual(worker.last_refusal, 409)

    def test_roster_native_scope_is_forwarded_exactly_and_participates_in_identity(self):
        w = self.make_watcher()
        calls = []
        w.worker.call = lambda method, path, body=None, retries=3: (calls.append((path, body)) or (True, {"result": "ok"}))
        roster = dict(exportedAt=self.at, nativeGuild="Olympus", nativeRealm="Native Realm Fixture", members=[dict(name="Aelin Stormwarden", guid="Player-1234-00ABCDEF")])
        w.forward_roster(roster)
        first_hash = w.state.d["roster_scope_hash"]
        self.assertEqual(calls[0][1]["nativeGuild"], "Olympus")
        self.assertEqual(calls[0][1]["nativeRealm"], "Native Realm Fixture")
        w.forward_roster(roster)
        self.assertEqual(len(calls), 1)
        w.forward_roster({**roster, "nativeGuild": "Olympus II"})
        self.assertEqual(len(calls), 2)
        self.assertNotEqual(w.state.d["roster_scope_hash"], first_hash)
        w.forward_roster({**roster, "exportedAt": self.at - 1})
        self.assertEqual(len(calls), 2, "A scope change cannot replay an older export")

    def test_missing_scope_is_not_invented_from_config(self):
        w = self.make_watcher()
        calls = []
        w.worker.call = lambda method, path, body=None, retries=3: (calls.append(body) or (True, {"result": "ok"}))
        w.forward_roster(dict(exportedAt=self.at, members=[dict(name="Aelin Stormwarden")]))
        self.assertNotIn("nativeGuild", calls[0])
        self.assertNotIn("nativeRealm", calls[0])


if __name__ == "__main__":
    unittest.main(verbosity=2)

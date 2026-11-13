"""Prospective native receipts, original custody and legacy holds; synthetic files only."""
from __future__ import annotations
import copy
import contextlib
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, os.environ.get("WATCHER_TEST_SOURCE", str(Path(__file__).resolve().parents[1])))
import intake242
import intake_schema280 as policy
import treasury_receipts227 as treasury
import watcher

SECRET = "synthetic-live242-officer-key-not-production"
VECTOR = {"id": "2fca8461bd8ecb1a64762032", "type": "donation", "source": "tithe-gold-v2",
          "character": "Trade Donor", "guid": "Player-1-9999ABCD", "requestedAt": 1794312000,
          "requestedBy": "Fern Melder", "guild": "OLYMPUS PRIME", "realm": "Native Realm", "clientVersion": "0.6.37",
          "donation": {"version": 2, "kind": "trade", "copper": 900, "recipient": "Fern Melder", "collectorGuid": "Player-1-1234ABCD", "reference": "TITHE-ABCD-EFGH"},
          "evidence": {"kind": "trade_complete_and_money_delta", "confirmedLocal": True, "automaticCredit": False, "mac": "25ac4d39227fbbb7cfdeda49674280b8"}}


def lua(value):
    if isinstance(value, dict):
        return "{" + ",".join("[" + lua(k) + "]=" + lua(v) for k, v in value.items()) + "}"
    if isinstance(value, list):
        return "{" + ",".join(lua(v) for v in value) + "}"
    if value is None:
        return "nil"
    if type(value) is bool:
        return "true" if value else "false"
    return json.dumps(value, ensure_ascii=False)


class TithePolicyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)
        self.w = watcher.Watcher(dict(wow_dir=str(self.path), account="SYNTHETIC", worker_url="https://test.invalid",
                                      watcher_token="synthetic-token", verify_secret=SECRET, officer_character="Fern Melder",
                                      state_file=str(self.path / "watcher.json")))
        self.w.sv_file.parent.mkdir(parents=True)
        self.calls = []; self.response = {"version": 242, "acknowledgements": []}
        self.w.worker.paused = lambda: None
        def transport(method, path, body=None, retries=3):
            self.calls.append((method, path, copy.deepcopy(body), retries))
            return True, copy.deepcopy(self.response)
        self.w.worker.call = transport

    def receipt(self, **changes):
        body = copy.deepcopy(VECTOR); body["requestedAt"] = int(time.time()); body.update(changes)
        body["evidence"]["mac"] = policy.tithe_mac(SECRET, body)
        return body

    def verify(self, eid="native-verify"):
        return {"id": eid, "type": "verify", "source": "whisper", "character": "Native Sender",
                "code": "ABC234", "guid": "Player-1-8888ABCD", "requestedAt": int(time.time())}

    def write(self, rows, filename="OlympusVerify.lua", dbname="OlympusVerifyDB", metadata=None):
        self.w.sv_file.with_name(filename).write_text(dbname + "=" + lua({"intake242": {"entries": rows, **({"bridgeMetadata": metadata} if metadata else {})}}), encoding="utf-8")

    def preserve(self, body, **metadata):
        canonical, digest = intake242._canonical_body(body)
        return {"body": canonical, "sha256": digest, "state": "pending", "attempted": False, **metadata}

    def test_cross_language_original_lua_vector_and_unicode_byte_lengths(self):
        self.assertEqual(policy.tithe_mac(SECRET, VECTOR), VECTOR["evidence"]["mac"])
        self.assertIsNone(policy.policy_error(VECTOR, SECRET, "Fern Melder", VECTOR["requestedAt"]))
        v = self.receipt(character="Élan Donor-RealmTwo")
        self.assertIn("20:Élan donor-realmtwo", policy.tithe_message(v))
        self.assertIsNone(policy.policy_error(v, SECRET, "Fern Melder"))
        v["character"] = "Élan Donor-RealmOne"
        self.assertEqual(policy.policy_error(v, SECRET), "receipt_authentication_held")

    def test_actual_lua_native_factory_passes_unchanged_through_savedvars_and_watcher(self):
        from lupa.luajit21 import LuaRuntime
        root = Path(__file__).resolve().parents[2]
        fixture = (root / "addon/tests/test_live242.lua").read_text(encoding="utf-8").split("\ndo\n", 1)[0]
        runtime = LuaRuntime(unpack_returned_tuples=True)
        with contextlib.chdir(root / "addon/tests"):
            rows = runtime.execute(fixture + r'''
local x=fixture(true)
x.e.GetAddOnMetadata=function() return '0.6.37' end
x.e.C_AddOns.GetAddOnMetadata=x.e.GetAddOnMetadata
x.e.GetUnitName=function(unit) return unit=='player' and 'Fern Melder' or string.char(195,137)..'lan Sender-RealmTwo' end
x.incoming=900;x.event('TRADE_SHOW')
assert(x.e.OlympusVerifyTreasury.SetTradeReference280('TITHE-ABCD-EFGH'))
x.event('TRADE_ACCEPT_UPDATE',1,1);x.wallet=x.wallet+900
x.event('UI_INFO_MESSAGE',1,'Trade complete.');x.event('PLAYER_MONEY')
return x.rows()
''')
        def plain(value):
            return {key: plain(child) for key, child in value.items()} if hasattr(value, "items") else value
        originals = plain(rows); self.assertEqual(len(originals), 1)
        original = next(iter(originals.values()))
        self.assertEqual(original["character"], "\u00c9lan Sender-RealmTwo")
        self.write(originals); intake242.collect(self.w); intake242.drain(self.w, collect_inputs=False)
        sent = self.calls[0][2]["entries"][0]
        self.assertEqual(sent, {key:value for key,value in original.items() if key != "status"})
        self.assertEqual(sent["evidence"]["mac"], policy.tithe_mac(SECRET, sent))
        self.assertNotIn("note", sent); self.assertNotIn("items", sent["donation"])

    def test_actual_nonfinancial_receivewire_bridge_metadata_reaches_watcher_unchanged(self):
        from lupa.luajit21 import LuaRuntime
        root = Path(__file__).resolve().parents[2]
        fixture = (root / "addon/tests/test_live242.lua").read_text(encoding="utf-8").split("\ndo\n", 1)[0]
        helpers = (root / "addon/tests/test_live_safety280.lua").read_text(encoding="utf-8").split("\ndo\n", 1)[0]
        runtime = LuaRuntime(unpack_returned_tuples=True)
        runtime.globals().LIVE280_NOW = int(time.time())
        with contextlib.chdir(root / "addon/tests"):
            rows = runtime.execute(fixture + helpers + r'''
local sender,receiver=member('Remote Sender'),fixture()
assert(sender.v.QueueSelf('ABC234'))
drain(sender,receiver)
return receiver.rows()
''')
        def plain(value):
            return {key: plain(child) for key, child in value.items()} if hasattr(value, "items") else value
        originals = plain(rows); self.assertEqual(len(originals), 1)
        original = next(iter(originals.values()))
        self.assertEqual(original["source"], "addon-bridge242")
        self.assertEqual(original["bridgeSender"], "Remote Sender")
        self.assertNotIn("nativeMembership", original, "sender metadata is not a native identity proof")
        self.write(originals); intake242.collect(self.w); intake242.drain(self.w, collect_inputs=False)
        sent = self.calls[0][2]["entries"][0]
        self.assertEqual(sent, {key:value for key,value in original.items() if key != "status"})
        output = os.environ.get("OLYMPUS_BRIDGE280_VECTOR_OUT")
        if output:
            Path(output).write_text(json.dumps(sent, ensure_ascii=False, sort_keys=True)+"\n", encoding="utf-8")

    def test_exact_closed_shapes_types_original_clock_and_mac(self):
        at = int(time.time()); body = self.receipt(requestedAt=at)
        cases = []
        for field in ("note", "items", "body", "rawSubject", "unexpected"):
            v = copy.deepcopy(body); v[field] = "private sentinel"; cases.append(v)
            v = copy.deepcopy(body); v["donation"][field] = "private sentinel"; cases.append(v)
            v = copy.deepcopy(body); v["evidence"][field] = "private sentinel"; cases.append(v)
        for key, value in (("requestedBy", "Other Officer"), ("source", "whisper-declaration"), ("guid", "guessed"), ("requestedAt", True), ("requestedAt", at + 6), ("requestedAt", at - 30 * 86400)):
            v = copy.deepcopy(body); v[key] = value; cases.append(v)
        for key, value in (("version", True), ("kind", "unknown"), ("copper", 0), ("copper", -1), ("copper", True), ("copper", 2**31), ("recipient", "Fernmelder"), ("reference", "TITHE-ABCI-EFGH"), ("reference", "TITHE-ABCD-EFGH TITHE-ABCD-EFGH"), ("collectorGuid", "")):
            v = copy.deepcopy(body); v["donation"][key] = value; cases.append(v)
        for v in cases:
            with self.subTest(v=v):
                self.assertIsNotNone(policy.policy_error(v, SECRET, "Fern Melder", at))
        self.assertIsNone(policy.policy_error(body, SECRET, "Fern Melder", at))
        self.assertIsNotNone(policy.policy_error(body, SECRET, "Other Officer", at))
        self.assertIsNotNone(policy.policy_error(body, "wrong synthetic secret", "Fern Melder", at))
        for stamp in (at - 30 * 86400 + 1, at + 5):
            v = self.receipt(requestedAt=stamp)
            self.assertIsNone(policy.policy_error(v, SECRET, "Fern Melder", at))

    def test_new_legacy_capture_is_not_imported_and_later_verify_can_post(self):
        legacy = {"id": "old-source", "type": "donation", "source": "whisper-declaration", "character": "Old Sender", "donation": {"copper": 100, "note": "PRIVATE_SENTINEL"}}
        self.write({"old-source": legacy, "good": self.verify()})
        intake242.collect(self.w); intake242.drain(self.w, collect_inputs=False)
        self.assertNotIn("old-source", self.w.state.d["intake242"])
        self.assertNotIn("PRIVATE_SENTINEL", self.w.state.path.read_text())
        self.assertEqual([r["type"] for r in self.calls[0][2]["entries"]], ["verify"])

    def test_local_native_receipt_posts_exact_original_and_mirror_cannot_taint_it(self):
        body = self.receipt(); self.write({body["id"]: body})
        self.write({body["id"]: body}, "Olympus.lua", "OlympusDB")
        intake242.collect(self.w)
        original = copy.deepcopy(self.w.state.d["intake242"][body["id"]])
        self.assertNotIn("bridgeUntrusted", original)
        intake242.drain(self.w, collect_inputs=False)
        self.assertEqual(self.calls[0][2]["entries"], [body])
        self.assertEqual(self.w.state.d["intake242"][body["id"]]["body"], original["body"])
        self.assertEqual(self.w.state.d["intake242"][body["id"]]["sha256"], original["sha256"])
        self.assertTrue(self.w.state.d["intake242"][body["id"]]["attempted"])

    def test_peer_only_financial_delivery_is_not_imported(self):
        body = self.receipt(); self.write({body["id"]: body}, "Olympus.lua", "OlympusDB")
        intake242.collect(self.w); intake242.drain(self.w, collect_inputs=False)
        self.assertEqual(self.calls, []); self.assertNotIn("intake242", self.w.state.d)

    def test_old_unknown_original_gets_metadata_hold_without_body_hash_attempt_changes(self):
        body = {"id": "old-source", "type": "donation", "source": "mail", "character": "Old Sender", "donation": {"copper": 100, "note": "PRIVATE_SENTINEL"}}
        original = self.preserve(body, state="outcome_unknown", attempted=True, receipt={"status": "unknown"}, attempts=7, acknowledgedAt=100)
        self.w.state.d["intake242"] = {body["id"]: copy.deepcopy(original)}
        intake242.drain(self.w, collect_inputs=False)
        held = self.w.state.d["intake242"][body["id"]]
        self.assertEqual({k:v for k,v in held.items() if k != "policyHold"}, original)
        self.assertEqual(held["policyHold"], "legacy_or_unqualified_receipt")
        self.assertEqual(self.calls, [])

    def test_invalid_incoming_same_id_cannot_poison_known_valid_original(self):
        body = self.receipt(); original = self.preserve(body, state="outcome_unknown", attempted=True)
        self.w.state.d["intake242"] = {body["id"]: copy.deepcopy(original)}
        hostile = copy.deepcopy(body); hostile["note"] = "PRIVATE_SENTINEL"
        self.write({body["id"]: hostile}); intake242.collect(self.w)
        self.assertEqual(self.w.state.d["intake242"][body["id"]], original)

    def test_collector_deferral_never_clears_attempted_or_changes_observation(self):
        body = self.receipt(); original = self.preserve(body)
        self.w.state.d["intake242"] = {body["id"]: original}
        self.response["deferred"] = [{"id": body["id"], "character": body["character"], "guid": body["guid"], "observedAt": body["requestedAt"], "bodySHA256": original["sha256"], "outcome": "receipt_collector_pending", "originalNoEffect": True}]
        intake242.drain(self.w, collect_inputs=False)
        self.assertTrue(original["attempted"]); self.assertEqual(original["body"], body)
        self.assertFalse(original["collectorRetry280"]["spent"])
        self.w.state.d["intake242"]["later"] = self.preserve(self.verify("later"))
        intake242.drain(self.w, collect_inputs=False)
        self.assertEqual([r["id"] for r in self.calls[-1][2]["entries"]], ["later"])

    def test_server_policy_hold_does_not_fabricate_terminal_ack(self):
        body = self.receipt(); self.w.state.d["intake242"] = {body["id"]: self.preserve(body)}
        self.response = {"version": 242, "policyHolds": [{"id": body["id"], "outcome": "intake_policy_held"}]}
        intake242.drain(self.w, collect_inputs=False)
        row = self.w.state.d["intake242"][body["id"]]
        self.assertEqual(row["state"], "pending"); self.assertTrue(row["attempted"])
        self.assertEqual(row["policyHold"], "server_intake_policy_held"); self.assertNotIn("receipt", row)

    def test_other_intake_rejects_unknown_text_but_keeps_actual_proof_fields(self):
        row = self.verify(); row["nativeMembership"] = {"version": 1, "member": True, "observedAt": int(time.time()), "scopeHash": "a"*16, "mac": "a"*32}
        self.assertIsNone(policy.policy_error(row, SECRET))
        row["nativeMembership"]["text"] = "PRIVATE_SENTINEL"
        self.assertIsNotNone(policy.policy_error(row, SECRET))

    def test_retired_v1_record_preserves_known_journal_and_staged_unknown(self):
        journal = treasury.TreasuryJournal(self.path / "old-journal.json")
        at = int(time.time()); event = dict(version=1,id="a"*24,ts=at,kind="trade",incomingCopper=900,outgoingCopper=0,sender="Old Sender",recipient="Fern Melder")
        event["mac"] = treasury.receipt_mac(SECRET, event)
        self.assertEqual(journal.record(event, SECRET, "savedvariables", at), "policy-held")
        self.assertFalse(journal.path.exists())
        canonical = {k:v for k,v in event.items() if k not in ("version", "mac")}
        frozen = {"version":1,"classification":"unclassified_receipts","receipts":{event["id"]:{**canonical,"recordedAt":at,"retainUntil":at+30*86400,"firstSource":"signed-chat"}}}
        journal.path.write_text(json.dumps(frozen), encoding="utf-8"); before = journal.path.read_bytes()
        self.assertEqual(journal.record(event, SECRET, "signed-chat", at), "duplicate")
        self.assertEqual(journal.path.read_bytes(), before)
        staged = journal._staged_path(); staged.write_bytes(b'{"private":"unknown staged original"}')
        with self.assertRaisesRegex(ValueError, "staged"):
            journal.record(event, SECRET, "savedvariables", at)
        self.assertEqual(journal.path.read_bytes(), before)
        self.assertEqual(staged.read_bytes(), b'{"private":"unknown staged original"}')
        journal.path.write_text("unreadable frozen original", encoding="utf-8"); staged.unlink()
        with self.assertRaisesRegex(ValueError, "unreadable"):
            journal.record(event, SECRET, "savedvariables", at)
        self.assertEqual(journal.path.read_text(), "unreadable frozen original")

    def test_staged_v1_custody_stops_actual_chat_cursor_before_advance(self):
        at = int(time.time())
        event = dict(version=1,id="b"*24,ts=at,kind="trade",incomingCopper=900,outgoingCopper=0,sender="Old Sender",recipient="Fern Melder")
        event["mac"] = treasury.receipt_mac(SECRET, event)
        self.w.chat_log.parent.mkdir(parents=True, exist_ok=True)
        self.w.chat_log.write_text("filler\n"*100, encoding="utf-8")
        self.w.tail_chat_log(); before = self.w.state.d["chat_offset"]
        note = f"Olympus: gold trade 900 paid 0 from Old Sender (id {event['id']}, ts {at}, ref OLVt-{event['mac']})"
        with self.w.chat_log.open("a", encoding="utf-8") as stream:
            stream.write("11/3 10:00:00.000  To Fern Melder: " + note + "\n")
        staged = self.w.treasury._staged_path(); frozen = b'{"original":"unconfirmed staged custody"}'
        staged.write_bytes(frozen)
        with self.assertRaisesRegex(watcher.NoCustody, "source retained"):
            self.w.tail_chat_log()
        self.assertEqual(self.w.state.d["chat_offset"], before)
        self.assertEqual(staged.read_bytes(), frozen)
        self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()

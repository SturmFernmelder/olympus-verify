"""Closed intake values and actual SavedVariables/run isolation; synthetic inputs only."""
import contextlib
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1]
ROOT = SOURCE.parent
sys.path.insert(0, os.environ.get("WATCHER_TEST_SOURCE", str(SOURCE)))
import intake242
import watcher


class StopLoop(BaseException):
    pass


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


class IntakeShapeTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.folder = Path(temp.name)
        self.w = watcher.Watcher(dict(wow_dir=str(self.folder), account="SYNTHETIC",
            worker_url="https://test.invalid", watcher_token="synthetic-token",
            verify_secret="synthetic-intake-only", officer_character="Fern Melder",
            membership_only=True, state_file=str(self.folder / "state.json")))
        self.w.sv_file.parent.mkdir(parents=True)
        self.calls, self.events, self.logs = [], [], []
        self.w.worker.paused = lambda: None
        self.w.worker.call = self.transport

    def transport(self, method, path, body=None, retries=3):
        self.calls.append((method, path, copy.deepcopy(body), retries))
        return True, {"version": 242, "acknowledgements": [
            {"id": r["id"], "character": r.get("character", r.get("name")),
             "status": "done", "outcome": "synthetic-observation", "guid": "", "discordRole": ""}
            for r in body["entries"]]}

    def row(self, eid="valid"):
        return {"id": eid, "type": "verify", "source": "whisper", "character": "Synthetic Sender",
                "status": "pending", "code": "ABC234", "guid": "Player-1-9999ABCD",
                "nativeMembership": {"version": 1, "member": True, "observedAt": 1900000000,
                                     "scopeHash": "a" * 16, "mac": "a" * 32}}

    def write(self, entries, name="OlympusVerify.lua", metadata=None):
        data = {"intake242": {"entries": entries, **({"bridgeMetadata": metadata} if metadata else {})}}
        self.w.sv_file.with_name(name).write_text("OlympusVerifyDB=" + lua(data), encoding="utf-8")

    def run_once(self, check=None, sleep_stop=False):
        self.w.require_launch_worker = lambda: self.events.append("startup")
        self.w.recover_local_settlement = lambda: self.events.append("recover")
        if check is not None:
            self.w.check_savedvars = check
        self.w.flush_outbox = lambda: self.events.append("flush")
        self.w.tail_chat_log = lambda: self.events.append("tail")
        self.w.forward_roster = lambda *a, **k: self.events.append("roster")
        self.w.note_saved_relay = lambda *a: None
        self.w.read_launch_control = lambda *a: None
        self.w.pull_launch_operations = lambda: self.events.append("launch")
        self.w.pull_queue = lambda: self.events.append("queue")
        def end():
            self.events.append("diag")
            raise StopLoop()
        self.w.scan_diag_logs = end
        def sleep(delay):
            if sleep_stop or delay == self.w.poll:
                raise StopLoop()
        with patch.object(watcher, "log", side_effect=self.logs.append), patch.object(watcher.time, "sleep", side_effect=sleep):
            with self.assertRaises(StopLoop):
                self.w.run()

    def test_mixed_key_and_nonfinite_rows_cannot_abort_later_valid_collection(self):
        self.write({"bad": {**self.row("bad"), 7: "not a JSON object key"},
                    "infinite": {**self.row("infinite"), "extra": math.inf}, "good": self.row("good")})
        self.w.sv_file.write_text(self.w.sv_file.read_text(encoding="utf-8").replace("Infinity", "1e999"), encoding="utf-8")
        with patch.object(intake242.json, "dumps", wraps=json.dumps) as encode:
            intake242.collect(self.w)
        self.assertEqual(list(self.w.state.d["intake242"]), ["good"])
        self.assertEqual(sum(call.kwargs.get("sort_keys") is True for call in encode.call_args_list), 1,
                         "invalid key/nonfinite number rejected before sorted body serialization")
        intake242.drain(self.w, collect_inputs=False)
        self.assertEqual([r["id"] for r in self.calls[0][2]["entries"]], ["good"])
        self.assertEqual(self.w.state.d["intake242"]["good"]["state"], "done")

    def test_actual_wire_queue_collect_and_run_keep_current_verify_factory_and_later_lanes(self):
        from lupa.luajit21 import LuaRuntime
        fixture = (ROOT / "addon/tests/test_live242.lua").read_text(encoding="utf-8").split("\ndo\n", 1)[0]
        runtime = LuaRuntime(unpack_returned_tuples=True)
        with contextlib.chdir(ROOT / "addon/tests"):
            rows = runtime.execute(fixture + r'''
local x=fixture()
local function wire(v)
 if type(v)=='string' then return 's'..#v..':'..v end
 if type(v)=='number' then local s=tostring(v);return 'n'..#s..':'..s end
 local n,parts=0,{};for k,value in pairs(v) do n=n+1;parts[#parts+1]=wire(k)..wire(value) end
 return 't'..n..':'..table.concat(parts)
end
local id=string.rep('e',32)
local raw=wire({id=id,type='verify',source='whisper',character='Synthetic Sender',code='ABC234',status='pending',[7]='numeric extra'})
local count=math.ceil(#raw/170)
for i=1,count do x.event('CHAT_MSG_ADDON','OLV242',id..':'..i..':'..count..':'..raw:sub((i-1)*170+1,i*170),'WHISPER','Synthetic Sender') end
local observation=x.v.NewVerificationObservation('whisper','Fresh Sender','Player-1-9999ABCD',100)
x.v.CaptureVerification('whisper','Fresh Sender','ABC234','Player-1-9999ABCD',nil,false,observation)
return x.rows()
''')
        def convert(v):
            return {k: convert(child) for k, child in v.items()} if hasattr(v, "items") else v
        native = convert(rows)
        self.assertEqual(native["e" * 32][7], "numeric extra", "actual wire stored malformed row")
        self.assertTrue(native["e" * 32]["bridgeUntrusted"])
        self.write(native)
        self.run_once()
        self.assertFalse(any("loop error" in line for line in self.logs), "actual mixed-key wire must not abort the run prefix")
        retained = self.w.state.d["intake242"]
        self.assertNotIn("e" * 32, retained)
        self.assertEqual(len(retained), 1, "the actual current verification factory remains admitted")
        original = next(iter(retained.values()))
        self.assertEqual(original["body"]["type"], "verify")
        self.assertEqual(original["body"]["code"], "ABC234")
        self.assertEqual(original["state"], "done")
        self.assertEqual(len(self.calls), 1)
        self.assertEqual([e for e in self.events if e in ("flush", "tail", "launch", "queue", "diag")],
                         ["flush", "tail", "launch", "queue", "diag"])
        self.assertFalse(any("loop error" in line for line in self.logs))

    def test_generic_value_tree_lists_keep_hash_without_granting_transport_admission(self):
        row = self.row()
        row.update(type="guild", nativeDiscord={"roles": ["1550000000000000000"], "facts": [{"index": 0}]},
                   nativeMembership={"version": 1, "member": True, "observedAt": 1900000000, "mac": "a" * 32})
        body, digest = intake242._canonical_body(row)
        expected = {k: v for k, v in row.items() if k != "status"}
        self.assertEqual(body, expected)
        self.assertEqual(digest, hashlib.sha256(json.dumps(expected, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest())
        self.assertEqual(row["status"], "pending", "input is not sanitized in place")
        self.assertIsNotNone(intake242.intake_schema280.policy_error(body, self.w.secret, self.w.officer),
                             "a valid JSON tree is not itself an admitted native transport shape")

    def test_invalid_value_trees_refused_before_json_without_conversion(self):
        cycle = [];cycle.append(cycle)
        deep = "leaf"
        for _ in range(intake242.MAX_BODY_DEPTH + 2):
            deep = [deep]
        cases = [{1: "numeric"}, {"mixed": {1: "numeric", "s": "text"}}, math.nan, math.inf, -math.inf,
                 {1, 2}, (1, 2), object(), "\ud800", cycle, deep, 2 ** 80,
                 "x" * intake242.MAX_BODY_BYTES, [0] * (intake242.MAX_CONTAINER_ITEMS + 1)]
        for value in cases:
            with self.subTest(kind=type(value).__name__), patch.object(intake242.json, "dumps", side_effect=AssertionError("invalid reached JSON")):
                self.assertIsNone(intake242._canonical_body({**self.row(), "extra": value}))

    def test_exact_encoded_size_and_value_count_boundaries(self):
        base = {"id": "size", "text": ""}
        overhead = len(json.dumps(base, sort_keys=True, separators=(",", ":")).encode())
        body, _ = intake242._canonical_body({"id": "size", "text": "x" * (intake242.MAX_BODY_BYTES - overhead)})
        self.assertEqual(len(json.dumps(body, sort_keys=True, separators=(",", ":")).encode()), intake242.MAX_BODY_BYTES)
        self.assertIsNone(intake242._canonical_body({"id": "size", "text": "x" * (intake242.MAX_BODY_BYTES - overhead + 1)}))
        self.assertIsNone(intake242._canonical_body({"id": "wide", "text": [[0] * 1024 for _ in range(5)]}))
        body, _ = intake242._canonical_body({"id": "escaped", "text": '\u00e9\n"\\\x00'})
        self.assertEqual(body["text"], '\u00e9\n"\\\x00')

    def test_invalid_source_cannot_taint_or_change_existing_unknown_original(self):
        body, digest = intake242._canonical_body(self.row("known"))
        original = {"body": body, "sha256": digest, "state": "outcome_unknown", "attempted": True,
                    "receipt": {"status": "unknown"}, "acknowledgedAt": 1900000000}
        self.w.state.d["intake242"] = {"known": copy.deepcopy(original)}
        self.write({"known": {**self.row("known"), "bad": {1: "numeric", "text": "mixed"}}}, name="Olympus.lua")
        intake242.collect(self.w)
        self.assertEqual(self.w.state.d["intake242"]["known"], original)
        self.write({"known": self.row("known")}, name="Olympus.lua", metadata={"known": {"untrusted": True, "origin": ["invalid"]}})
        intake242.collect(self.w)
        self.assertEqual(self.w.state.d["intake242"]["known"], original)
        intake242.drain(self.w, collect_inputs=False)
        self.assertEqual(self.calls, [])

    def test_unreadable_source_file_does_not_hide_another_file_valid_row(self):
        self.w.sv_file.write_text("not valid Lua !PRIVATE_INPUT", encoding="utf-8")
        self.write({"valid": self.row()}, name="OlympusRecordDB.lua")
        intake242.collect(self.w)
        self.assertEqual(list(self.w.state.d["intake242"]), ["valid"])

    def test_recoverable_savedvariables_shape_failure_allows_later_lanes(self):
        self.w.sv_file.write_text("OlympusVerifyDB=42", encoding="utf-8")
        self.run_once()
        self.assertEqual([e for e in self.events if e in ("flush", "tail", "launch", "queue", "diag")],
                         ["flush", "tail", "launch", "queue", "diag"])
        self.assertTrue(any("SavedVariables source held" in line for line in self.logs))
        self.assertEqual(self.w.state.d["sv_mtime"], 0)

    def test_state_save_errors_are_global_custody_halts_not_source_failures(self):
        for error in (OSError("PRIVATE_JOURNAL"), TypeError("PRIVATE_JOURNAL"), ValueError("PRIVATE_JOURNAL")):
            with self.subTest(error=type(error).__name__):
                self.events.clear();self.w._custody_halted = False
                self.write({"valid": self.row()})
                with patch.object(self.w.state, "save", side_effect=error), self.assertRaises(watcher.CustodyStopped):
                    self.run_once()
                self.assertTrue(self.w._custody_halted)
                self.assertFalse(any(e in self.events for e in ("flush", "tail", "launch", "queue", "diag")))
                self.assertNotIn("PRIVATE_JOURNAL", " ".join(self.logs))
                self.assertIn("valid", self.w.state.d["intake242"], "possibly committed original retained")

    def test_drain_reservation_failure_cannot_post(self):
        self.write({"valid": self.row()});intake242.collect(self.w)
        with patch.object(self.w.state, "save", side_effect=OSError("synthetic journal")), self.assertRaises(OSError):
            intake242.drain(self.w, collect_inputs=False)
        self.assertTrue(self.w._custody_halted)
        self.assertEqual(self.calls, [])
        self.assertTrue(self.w.state.d["intake242"]["valid"]["attempted"])

    def test_unclassified_exception_is_not_treated_as_recoverable_source(self):
        def broken():
            raise TypeError("PRIVATE_UNCLASSIFIED")
        self.run_once(check=broken, sleep_stop=True)
        self.assertFalse(any(e in self.events for e in ("flush", "tail", "launch", "queue", "diag")))
        self.assertTrue(any("loop error: TypeError" in line for line in self.logs))
        self.assertNotIn("PRIVATE_UNCLASSIFIED", " ".join(self.logs))

    def test_source_failure_does_not_override_existing_global_custody_halt(self):
        self.w._custody_halted = True
        with self.assertRaises(watcher.CustodyStopped):
            self.run_once(check=lambda: (_ for _ in ()).throw(watcher.SavedVariablesSourceUnavailable()))
        self.assertFalse(any(e in self.events for e in ("flush", "tail", "launch", "queue", "diag")))


if __name__ == "__main__":
    unittest.main()

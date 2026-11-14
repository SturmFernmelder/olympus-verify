"""Actual bounded SavedVariables/ACK/readiness path; synthetic native data and HTTP only."""
from __future__ import annotations
import copy
from datetime import datetime, timezone
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
import watcher
import codes
import officer_invites233
from native_membership227 import membership_mac

SECRET = "synthetic-source-witness-only"
NAME = "Fresh Member"
GUID = "Player-1-ABCDEF12"
OFFICER_GUID = "Player-1-00000001"
GUILD = "OLYMPUS PRIME"
REALM = "Synthetic Native Realm"


def lua(value):
    if isinstance(value, dict):
        return "{" + ",".join("[" + lua(k) + "]=" + lua(v) for k, v in value.items()) + "}"
    if isinstance(value, list):
        return "{" + ",".join(lua(v) for v in value) + "}"
    if type(value) is bool:
        return "true" if value else "false"
    if value is None:
        return "nil"
    return json.dumps(value)


class VerificationSourceWitness280Tests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(); self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.at = int(time.time())
        clock = patch.object(watcher.time, "time", side_effect=lambda: self.at)
        clock.start(); self.addCleanup(clock.stop)
        cfg = dict(wow_dir=str(self.root), account="SYNTHETIC", worker_url="https://test.invalid",
                   watcher_token="synthetic-token", verify_secret=SECRET, officer_character="Fern Melder",
                   membership_only=True, state_file=str(self.root / "state.json"))
        self.w = watcher.Watcher(cfg)
        self.w.sv_file.parent.mkdir(parents=True)
        self.calls = []; self.unknown_roster = False; self.unknown_verify = False
        self.w.worker.call = self.transport
        self.code = codes.code_for(SECRET, NAME, codes.day_bucket(datetime.fromtimestamp(self.at, timezone.utc)))
        self.db = dict(lastCharacterGuid=OFFICER_GUID, events=[], roster=dict(exportedAt=self.at, total=2,
            nativeGuild=GUILD, nativeRealm=REALM, members=[
                dict(name="Fern Melder", guid=OFFICER_GUID, rank="Guild Master", rankIndex=0, level=60),
                dict(name=NAME, guid=GUID, rank="Member", rankIndex=7, level=60)]))

    def transport(self, method, path, body=None, retries=3):
        self.calls.append((method, path, copy.deepcopy(body), retries))
        if path == "/ingest/roster":
            return (False, "synthetic unknown") if self.unknown_roster else (True, dict(snapshot=7, trusted=True, members=len(body["members"])))
        if path == "/ingest/verify":
            return (False, "synthetic unknown") if self.unknown_verify else (True, dict(result="member", pendingConsumed=True))
        raise AssertionError("Unexpected synthetic transport path")

    def body(self):
        proof = dict(version=1, member=True, observedAt=self.at,
            scopeHash=hashlib.sha256(("native-scope|1|" + GUILD + "|" + REALM).encode()).hexdigest()[:16])
        proof["mac"] = membership_mac(SECRET, NAME, GUID, self.code, proof)
        return dict(character=NAME, guid=GUID, code=self.code, source="whisper", ts=self.at,
                    officer="Fern Melder", nativeMembership=proof)

    def line(self):
        p = self.body()["nativeMembership"]
        return f"11/6 01:00:00.000  To Fern Melder: Olympus: member {NAME} {GUID} {self.code} 1 {p['observedAt']} {p['scopeHash']} (ref OLVm-{p['mac']})"

    def write(self, *, restore_stamp=False, replace=False):
        old = self.w.sv_file.stat() if self.w.sv_file.exists() else None
        target = self.w.sv_file.with_name("replacement.lua") if replace else self.w.sv_file
        target.write_text("OlympusVerifyDB=" + lua(self.db), encoding="utf-8")
        if restore_stamp and old is not None:
            os.utime(target, ns=(old.st_atime_ns, old.st_mtime_ns))
        if replace:
            os.replace(target, self.w.sv_file)

    def admit(self):
        self.write(); self.w.check_savedvars()
        self.assertTrue(self.w.verification_roster_ready(self.body()))
        self.calls.clear()

    def verify_paths(self):
        return [c for c in self.calls if c[1] == "/ingest/verify"]

    def assert_held(self):
        self.assertFalse(self.w.verification_roster_ready(self.body()))
        with self.assertRaises(watcher.VerificationDeferred):
            self.w.handle_chat_line(self.line())
        self.assertFalse(self.verify_paths())

    def test_known_ack_same_source_stays_ready_and_actual_whisper_posts_once(self):
        self.admit(); original = copy.deepcopy(self.w._verification_roster)
        self.w.check_savedvars()
        self.assertTrue(self.w.verification_roster_ready(self.body()))
        self.assertEqual(self.w._verification_roster["exportedAt"], original["exportedAt"])
        self.w.handle_chat_line(self.line()); self.w.handle_chat_line(self.line())
        self.assertEqual(len(self.verify_paths()), 1)

    def test_unrelated_saved_metadata_revalidates_same_roster_without_reclocking_ack(self):
        self.admit(); original = copy.deepcopy(self.w._verification_roster)
        self.db["uiOnly"] = "new synthetic metadata"; self.write(restore_stamp=True)
        self.w.check_savedvars()
        self.assertTrue(self.w.verification_roster_ready(self.body()))
        self.assertEqual(self.w._verification_roster["exportedAt"], original["exportedAt"])
        self.assertEqual(self.w._verification_roster["snapshot"], original["snapshot"])
        self.assertFalse(self.calls)

    def test_timestamp_only_new_export_preserves_original_ack_cutoff(self):
        self.admit(); original = copy.deepcopy(self.w._verification_roster)
        self.at += 1; self.db["roster"]["exportedAt"] = self.at
        self.write(restore_stamp=True); self.w.check_savedvars()
        self.assertTrue(self.w.verification_roster_ready(self.body()))
        self.assertEqual(self.w._verification_roster["exportedAt"], original["exportedAt"])
        self.assertEqual(self.w._verification_roster["fileSource280"]["exportedAt"], original["fileSource280"]["exportedAt"])
        self.assertEqual(self.w._verification_roster["snapshot"], original["snapshot"])
        self.assertFalse(self.calls)

    def test_decreasing_export_time_holds_without_new_ack_inference(self):
        self.admit(); self.db["roster"]["exportedAt"] -= 1
        self.write(restore_stamp=True); self.w.check_savedvars(); self.assert_held()

    def test_too_future_export_time_holds_without_new_ack_inference(self):
        self.admit(); self.db["roster"]["exportedAt"] += 6
        self.write(restore_stamp=True); self.w.check_savedvars(); self.assert_held()

    def test_invalid_membership_hmac_cannot_use_known_roster_ack(self):
        self.admit(); body = self.body(); body["nativeMembership"]["mac"] = "0" * 32
        self.assertFalse(self.w.verification_roster_ready(body))
        self.w.forward_events([dict(type="whisper", name=NAME, guid=GUID, code=self.code,
            ok=True, ts=self.at, nativeMembership=body["nativeMembership"])])
        self.assertFalse(self.verify_paths()); self.assertFalse(self.w.state.d["outbox"])

    def test_same_size_restored_stamp_name_change_cannot_use_prior_ack(self):
        self.admit(); self.db["roster"]["members"][1]["name"] = "Fresh Membez"
        self.write(restore_stamp=True); self.w.check_savedvars(); self.assert_held()

    def test_same_size_restored_stamp_guid_change_cannot_use_prior_ack(self):
        self.admit(); self.db["roster"]["members"][1]["guid"] = "Player-1-ABCDEF13"
        self.write(restore_stamp=True); self.w.check_savedvars(); self.assert_held()

    def test_same_size_restored_stamp_rank_change_cannot_use_prior_ack(self):
        self.admit(); self.db["roster"]["members"][1]["rankIndex"] = 8
        self.write(restore_stamp=True); self.w.check_savedvars(); self.assert_held()

    def test_scope_switch_same_stamp_cannot_use_prior_ack(self):
        self.admit(); self.db["roster"]["nativeRealm"] = "Synthetic Nativf Realm"
        self.write(restore_stamp=True); self.w.check_savedvars(); self.assert_held()

    def test_changed_officer_guid_cannot_use_prior_ack(self):
        self.admit(); self.db["lastCharacterGuid"] = "Player-1-00000002"
        self.write(restore_stamp=True); self.w.check_savedvars(); self.assert_held()

    def test_same_bytes_same_stamp_path_replacement_requires_new_known_ack(self):
        self.admit(); self.write(restore_stamp=True, replace=True)
        self.w.check_savedvars(); self.assert_held()

    def test_changed_source_path_with_same_inode_cannot_use_prior_ack(self):
        self.admit(); other = self.w.sv_file.with_name("other-source.lua")
        os.rename(self.w.sv_file, other); self.w.sv_file = other
        self.w.check_savedvars(); self.assert_held()

    def test_officer_invite_readiness_uses_same_actual_source_guard(self):
        self.admit(); name = "Fresh Candidate"; guid = "Player-1-ABCDEF13"
        code = codes.code_for(SECRET, name, codes.day_bucket(datetime.fromtimestamp(self.at, timezone.utc)))
        p = dict(version=233, proofId="1" * 32, fullName=name, unitGuid=guid, unitFullName=name,
            whisperAt=self.at, requestedAt=self.at, observedAt=self.at, scopeHash=self.body()["nativeMembership"]["scopeHash"],
            guildState="unguilded", source=officer_invites233.SOURCE, before="2" * 64, after="3" * 64)
        body = dict(character=name, guid=guid, code=code, source="whisper", nativeInvite=p)
        p["mac"] = officer_invites233.proof_mac(SECRET, body)
        self.assertTrue(self.w.officer_invite_roster_ready(body))
        self.db["roster"]["members"][1]["guid"] = guid; self.write(restore_stamp=True)
        self.assertFalse(self.w.officer_invite_roster_ready(body))

    def test_readiness_itself_revalidates_bytes_before_next_intake_pass(self):
        self.admit(); self.db["roster"]["members"][1]["guid"] = "Player-1-ABCDEF13"
        self.write(restore_stamp=True); self.assert_held()

    def test_roster_object_without_consumed_file_cannot_create_readiness(self):
        self.w.forward_roster(self.db["roster"])
        self.assert_held()

    def test_late_exact_known_roster_ack_survives_identical_source_recheck(self):
        self.db["events"] = [dict(type="whisper", name=NAME, guid=GUID, code=self.code,
            ok=True, ts=self.at, nativeMembership=self.body()["nativeMembership"])]
        self.unknown_roster = True; self.write(); self.w.check_savedvars()
        self.assertFalse(self.w.verification_roster_ready(self.body()))
        self.unknown_roster = False; self.w.flush_outbox()
        self.assertTrue(self.w.verification_roster_ready(self.body()))
        self.w.check_savedvars(); self.w.handle_chat_line(self.line())
        self.assertEqual(len(self.verify_paths()), 1)

    def test_late_known_roster_ack_cannot_admit_changed_source(self):
        self.unknown_roster = True; self.write(); self.w.check_savedvars()
        self.db["roster"]["members"][1]["guid"] = "Player-1-ABCDEF13"; self.write(restore_stamp=True)
        self.unknown_roster = False; self.w.flush_outbox(); self.assert_held()

    def test_changed_source_preserves_exact_unattempted_pending_original(self):
        self.admit()
        with patch.object(self.w.worker, "paused", return_value="synthetic pause"):
            self.w.handle_chat_line(self.line())
        before = copy.deepcopy(self.w.state.d["outbox"])
        self.db["roster"]["members"][1]["guid"] = "Player-1-ABCDEF13"; self.write(restore_stamp=True)
        self.w.check_savedvars(); self.w.flush_outbox()
        self.assertFalse(self.w.verification_roster_ready(self.body()))
        self.assertEqual(self.w.state.d["outbox"], before)
        self.assertFalse(self.verify_paths())

    def test_changed_source_preserves_unknown_attempted_original_without_resend(self):
        self.admit(); self.unknown_verify = True; self.w.handle_chat_line(self.line())
        before = copy.deepcopy(self.w.state.d["outbox"]); count = len(self.verify_paths())
        self.db["roster"]["members"][1]["guid"] = "Player-1-ABCDEF13"; self.write(restore_stamp=True)
        self.w.check_savedvars(); self.w.flush_outbox()
        self.assertFalse(self.w.verification_roster_ready(self.body()))
        self.assertEqual(self.w.state.d["outbox"], before)
        self.assertEqual(len(self.verify_paths()), count)

    def test_new_actual_source_and_known_ack_restore_readiness(self):
        self.admit(); self.db["roster"]["members"][1]["rankIndex"] = 8
        self.write(restore_stamp=True); self.w.check_savedvars(); self.assert_held()
        self.at += 2; self.db["roster"]["exportedAt"] = self.at
        self.write(); self.w.check_savedvars()
        self.assertTrue(self.w.verification_roster_ready(self.body()))
        self.assertEqual(self.w._verification_roster["exportedAt"], self.at)


if __name__ == "__main__":
    unittest.main()

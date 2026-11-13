"""Real Watcher diagnostics/projections/startup; temporary paths, synthetic HTTP only."""
from __future__ import annotations
import copy
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
import subprocess
import urllib.error
import hmac
import hashlib
from types import SimpleNamespace
from unittest.mock import patch
from email.utils import formatdate

sys.path.insert(0, os.environ.get("WATCHER_TEST_SOURCE", str(Path(__file__).resolve().parents[1])))
import watcher
import intake242
import safe_projection280 as projection
import test_directive_rank_transition as directive


HEALTH = {"ok": True, "build": "2026-11-12.280", "verification": {"mode": "members-only", "nativeScopePinned": True, "nativeMembershipProofVersion": 1, "nativeRosterProtocolVersion": 2}}


class Reply(io.BytesIO):
    status = 200
    def __init__(self, value=HEALTH, date=None, url="https://test.invalid/health"):
        super().__init__(json.dumps(value).encode()); self.headers = {"Date": date} if date else {}; self.url = url
    def geturl(self): return self.url


class WatcherOutput280Tests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(); self.addCleanup(tmp.cleanup); self.root = Path(tmp.name)
        self.at = 1900000000
        self.w = watcher.Watcher(dict(wow_dir=str(self.root), account="SYNTHETIC", worker_url="https://test.invalid",
            watcher_token="synthetic-token", verify_secret="synthetic-secret", officer_character="Officer", membership_only=True,
            state_file=str(self.root / "state.json")))
        self.w.queue_file.parent.mkdir(parents=True)
        self.logs = []; self.calls = []; self.w.pull_strict_display = lambda: None
        self.w.worker.paused = lambda: None; self.w._optional_role_wake264 = lambda *a: None

    def terminal(self, observed=None):
        row = {"body": {"id": "original"}, "state": "done", "attempted": True, "acknowledgedAt": observed or self.at,
            "receipt": {"id": "original", "status": "done", "character": "Synthetic Sender", "guid": "Player-1-ABCD", "discordRole": "", "outcome": "known"}}
        self.w.state.d["intake242"] = {"original": row}; return row

    def transport(self, method, path, body=None, retries=3):
        self.calls.append((method, path))
        return True, {"presenceOnly": True, "verificationResults": []}

    def test_terminal_delivery_has_fixed_original24h_visibility_without_custody_erasure(self):
        row = self.terminal(); before = copy.deepcopy(row)
        with patch.object(intake242.time, "time", return_value=self.at + 10): first = intake242.receipts(self.w)
        with patch.object(intake242.time, "time", return_value=self.at + 1000): second = intake242.receipts(self.w)
        with patch.object(intake242.time, "time", return_value=self.at + 86400): expired = intake242.receipts(self.w)
        self.assertEqual(first, second); self.assertEqual(expired, []); self.assertEqual(row, before)

    def test_members_only_unchanged_projection_writes_once_and_expiry_clears_once(self):
        row = self.terminal(); before = copy.deepcopy(row); self.w.worker.call = self.transport
        native = watcher.os.replace; writes = []
        def replace(a, b): writes.append(Path(b).name); return native(a, b)
        with patch.object(watcher.os, "replace", replace):
            for at in (self.at, self.at + 30, self.at + 60, self.at + 86400, self.at + 86430):
                with patch.object(watcher.time, "time", return_value=at): self.w.pull_queue()
        self.assertEqual(writes, ["OlympusQueue.lua", "OlympusQueue.lua"])
        self.assertNotIn('id = "original"', self.w.queue_file.read_text(encoding="utf-8")); self.assertEqual(row, before)

    def test_projection_does_not_create_missing_game_output_parent(self):
        self.w.queue_file = self.root / "missing" / "OlympusQueue.lua"; self.terminal(); self.w.worker.call = self.transport
        with patch.object(watcher.time, "time", return_value=self.at), patch.object(watcher, "log", self.logs.append): self.w.pull_queue()
        self.assertFalse(self.w.queue_file.parent.exists())

    def test_existing_unowned_fixed_temp_is_preserved(self):
        temp = self.w.queue_file.with_suffix(".tmp"); temp.write_text("RETAINED UNKNOWN", encoding="utf-8")
        self.terminal(); self.w.worker.call = self.transport
        with patch.object(watcher.time, "time", return_value=self.at): self.w.pull_queue()
        self.assertEqual(temp.read_text(encoding="utf-8"), "RETAINED UNKNOWN")

    def test_parent_alias_never_receives_projection(self):
        parent = self.w.queue_file.parent; real = self.root / "different"; parent.rename(real)
        try: parent.symlink_to(real, target_is_directory=True)
        except OSError:
            real.rename(parent); self.skipTest("OS does not permit synthetic directory symlink")
        self.terminal(); self.w.worker.call = self.transport
        with patch.object(watcher.time, "time", return_value=self.at): self.w.pull_queue()
        self.assertFalse((real / "OlympusQueue.lua").exists())

    def test_noop_revalidates_hardlink_target_instead_of_trusting_cached_input(self):
        self.terminal(); self.w.worker.call = self.transport
        with patch.object(watcher.time, "time", return_value=self.at): self.w.pull_queue()
        before = self.w.queue_file.read_bytes(); os.link(self.w.queue_file, self.root / "target-alias")
        with patch.object(watcher.time, "time", return_value=self.at+30), patch.object(projection.os, "replace", side_effect=AssertionError("aliased no-op wrote")):
            self.w.pull_queue()
        self.assertEqual(self.w.queue_file.read_bytes(), before)

    def test_detected_target_swap_before_replace_preserves_other_bytes(self):
        path = self.w.queue_file; path.write_text("OLD", encoding="utf-8"); native = projection._guard; calls = []
        def swap(*args):
            result = native(*args); calls.append(True)
            if len(calls) == 1: path.write_text("OTHER WRITER", encoding="utf-8")
            return result
        with patch.object(projection, "_guard", swap):
            with self.assertRaises(projection.ProjectionUnavailable): projection.write(path, path.parent, "NEW", {"new": True})
        self.assertEqual(path.read_text(encoding="utf-8"), "OTHER WRITER")

    def test_exclusive_temp_collision_never_overwrites_another_file(self):
        path = self.w.queue_file; temporary = path.with_name("."+path.name+"."+"a"*32+".tmp")
        temporary.write_text("RETAINED TEMP", encoding="utf-8")
        with patch.object(projection.uuid, "uuid4", return_value=SimpleNamespace(hex="a"*32)):
            with self.assertRaises(projection.ProjectionUnavailable): projection.write(path, path.parent, "NEW", {})
        self.assertEqual(temporary.read_text(encoding="utf-8"), "RETAINED TEMP")

    def test_unqualified_empty_cache_does_not_clear_previous_dated_projection(self):
        self.terminal(); self.w.worker.call = self.transport
        with patch.object(watcher.time, "time", return_value=self.at): self.w.pull_queue()
        before = self.w.queue_file.read_bytes()
        self.w.worker.call = lambda method,path,**kw: (False, {}) if "cacheOnly" in path else (True,{"presenceOnly":True})
        with patch.object(watcher.time, "time", return_value=self.at+86401): self.w.pull_queue()
        self.assertEqual(self.w.queue_file.read_bytes(), before)

    def test_invalid_control_is_diagnosed_once_without_claim_or_projection(self):
        f = directive.DirectiveTransition(); f.setUp(); c = f.control(); c["mac"] = "0" * 32
        db = dict(roster=f.roster, launchControl=c, lastCharacter="Officer", lastCharacterGuid=f.actor)
        before = copy.deepcopy(self.w.state.d)
        with patch.object(watcher.time, "time", return_value=f.at), patch.object(watcher, "log", self.logs.append):
            self.w.read_launch_control(db); self.w.read_launch_control(db)
        self.assertEqual(self.w.state.d, before); self.assertEqual(len(self.logs), 1); self.assertIn("control", self.logs[0])
        self.assertFalse(self.w.launch_selected_file.exists()); self.assertFalse(self.w.launch_operations_file.exists())

    def test_selected_same_pause_does_not_rewrite_or_refresh_original_dates(self):
        f = directive.DirectiveTransition(); f.setUp(); selected = self.w.launch_selected
        selected.clock = lambda: f.at
        selected.request(f.control(), dict(snapshot=12, exportedAt=f.roster["exportedAt"], digest=watcher.launch_operations229.complete_roster_digest(f.roster)), f.roster, f.at)
        self.w.worker.paused = lambda: {"httpStatus": 429, "retryAfterSeconds": 5}; before = copy.deepcopy(selected.record)
        native = watcher.os.replace; writes = []
        with patch.object(watcher.time, "time", return_value=f.at), patch.object(watcher.os, "replace", side_effect=lambda a,b: (writes.append(str(b)), native(a,b))[1]):
            for _ in range(25): self.w._pull_launch_selected()
        self.assertEqual(len(writes), 1); self.assertEqual(selected.record["attempts"], before["attempts"])
        self.assertEqual(selected.record["expiresAt"], before["expiresAt"])

    def test_changed_pause_that_exceeds_original_admission_writes_one_hold(self):
        f=directive.DirectiveTransition();f.setUp();selected=self.w.launch_selected;selected.clock=lambda:f.at
        selected.request(f.control(),dict(snapshot=12,exportedAt=f.roster["exportedAt"],digest=watcher.launch_operations229.complete_roster_digest(f.roster)),f.roster,f.at)
        expires=selected.record["expiresAt"];delay=[5];self.w.worker.paused=lambda:{"httpStatus":429,"retryAfterSeconds":delay[0]}
        native=watcher.os.replace;writes=[]
        with patch.object(watcher.time,"time",return_value=f.at),patch.object(watcher.os,"replace",side_effect=lambda a,b:(writes.append(str(b)),native(a,b))[1]):
            self.w._pull_launch_selected();delay[0]=600;self.w._pull_launch_selected();self.w._pull_launch_selected()
        self.assertEqual(len(writes),2);self.assertEqual(selected.record["stoppedReason"],"rate-limit-exceeds-scan")
        self.assertEqual(selected.record["expiresAt"],expires);self.assertEqual(selected.record["attempts"],0)

    def test_pause_arriving_after_due_wait_also_writes_only_transition(self):
        f=directive.DirectiveTransition();f.setUp();clock=[float(f.at)];selected=self.w.launch_selected;selected.clock=lambda:clock[0]
        selected.request(f.control(),dict(snapshot=12,exportedAt=f.roster["exportedAt"],digest=watcher.launch_operations229.complete_roster_digest(f.roster)),f.roster,f.at)
        selected.next_at=f.at+1;self.w._launch_consumed_sv_witness="synthetic-completed-source";self.w._launch_savedvars_witness=lambda:"synthetic-completed-source"
        pauses=[None,{"httpStatus":429,"retryAfterSeconds":5}];self.w.worker.paused=lambda:pauses.pop(0)
        self.w.worker.call=lambda *a,**k:self.fail("paused read dispatched");native=watcher.os.replace;writes=[]
        def advance(seconds):clock[0]+=seconds
        with patch.object(watcher.time,"time",side_effect=lambda:clock[0]),patch.object(watcher.time,"sleep",advance),patch.object(watcher.os,"replace",side_effect=lambda a,b:(writes.append(str(b)),native(a,b))[1]):
            self.w._pull_launch_selected();self.w.worker.paused=lambda:{"httpStatus":429,"retryAfterSeconds":5}
            for _ in range(10):self.w._pull_launch_selected()
        self.assertEqual(len(writes),1);self.assertEqual(selected.record["attempts"],0);self.assertEqual(selected.record["expiresAt"],f.at+599)

    def test_transient_health_retries_are_bounded_gets_before_startup_admission(self):
        answers = [TimeoutError(), ConnectionResetError(), Reply()]; requests = []; sleeps = []
        def open(request, **kwargs):
            requests.append((request.method, request.full_url)); answer = answers.pop(0)
            if isinstance(answer, BaseException): raise answer
            return answer
        self.w.worker.opener.open = open
        with patch.object(watcher.time, "sleep", sleeps.append): self.w.require_launch_worker()
        self.assertEqual(requests, [("GET", "https://test.invalid/health")] * 3); self.assertEqual(sleeps, [1, 3])

    def test_wrong_profile_is_permanent_and_never_retried(self):
        requests = []; self.w.worker.opener.open = lambda request, **kw: (requests.append(request.method) or Reply({"ok": True}))
        with patch.object(watcher.time, "sleep", side_effect=AssertionError("permanent retry")):
            with self.assertRaises(watcher.LaunchNotReady): self.w.require_launch_worker()
        self.assertEqual(requests, ["GET"])

    def test_custody_failure_during_health_cannot_be_admitted_as_ready(self):
        def answer(*a, **k): self.w._custody_halted = True; return True, HEALTH
        self.w.worker.call = answer
        with self.assertRaises(watcher.CustodyStopped): self.w.require_launch_worker()
        self.assertIsNone(self.w._role_wake_startup264)

    def test_transient_exhaustion_stops_at_three_and_auth_pause_stops_before_http(self):
        requests = []; sleeps = []
        def fail(*a, **k): requests.append(True); raise TimeoutError()
        self.w.worker.opener.open = fail
        with patch.object(watcher.time, "sleep", sleeps.append):
            with self.assertRaises(watcher.LaunchNotReady): self.w.require_launch_worker()
        self.assertEqual(len(requests), 3); self.assertEqual(sleeps, [1,3])
        self.w.worker.paused = lambda: watcher.Worker.paused(self.w.worker)
        self.w.state.d["worker_retry_at"] = time.time()+900; self.w.state.d["worker_retry_status"] = 403
        with patch.object(watcher.time, "sleep", side_effect=AssertionError("paused startup retry")):
            with self.assertRaises(watcher.LaunchNotReady): self.w.require_launch_worker()
        self.assertEqual(len(requests), 3)

    def test_known503_health_retry_does_not_retry_post_or_malformed_health(self):
        requests = []; replies = [503, Reply()]
        def open(req, **kw):
            requests.append(req.method); r = replies.pop(0)
            if type(r) is int: raise urllib.error.HTTPError(req.full_url,r,"synthetic",{},io.BytesIO(b"PRIVATE_BODY"))
            return r
        self.w.worker.opener.open = open
        with patch.object(watcher.time, "sleep", lambda *a:None): self.w.require_launch_worker()
        self.assertEqual(requests, ["GET","GET"])
        self.w.worker.opener.open = lambda req, **kw: Reply([])
        with self.assertRaises(watcher.LaunchNotReady): self.w.require_launch_worker()
        calls=[]
        def post(req, **kw): calls.append(req.method); raise TimeoutError()
        self.w.worker.opener.open = post
        with patch.object(watcher.time, "sleep", lambda *a:None): self.w.worker.call("POST","/ingest/events",{},retries=1)
        self.assertEqual(calls,["POST"]); self.assertFalse(self.w.worker.last_startup_transient280)

    def test_actual_response_date_only_warns_about_possible_skew(self):
        w = self.w.worker; w.opener.open = lambda *a, **k: Reply(date=formatdate(self.at - 20, usegmt=True))
        with patch.object(watcher.time, "time", return_value=self.at), patch.object(watcher, "log", self.logs.append):
            self.assertTrue(w.call("GET", "/health", retries=1)[0]); self.assertTrue(w.call("GET", "/health", retries=1)[0])
        self.assertEqual(len([s for s in self.logs if "clock" in s.lower()]), 1)
        self.assertEqual(self.w.state.d["worker_retry_at"], 0)

    def test_clock_uncertainty_and_wrong_origin_never_become_proof_or_pause(self):
        for offset, elapsed, expected in [(20,0,"possibly-slow"),(-20,0,"possibly-fast"),(10,20,"within-estimate"),(100,40,"inconclusive")]:
            self.w.worker._note_clock280(Reply(date=formatdate(self.at+offset,usegmt=True)),self.at,self.at+elapsed,elapsed)
            self.assertEqual(self.w.worker._clock_diagnosis280,expected)
        before=copy.deepcopy(self.w.state.d)
        self.w.worker._note_clock280(Reply(date=formatdate(self.at+100,usegmt=True),url="https://other.invalid/health"),self.at,self.at,0)
        self.w.worker._note_clock280(Reply(),self.at,self.at,0)
        self.assertEqual(self.w.worker._clock_diagnosis280,"inconclusive"); self.assertEqual(self.w.state.d,before)

    def test_deferred_verification_logs_no_forwarding_and_actual_unknown_attempt_once(self):
        observed=int(time.time()); name="Synthetic Sender"; guid="Player-1-ABCD"; code="ABC234"; scope="a"*16
        mac=hmac.new(self.w.secret.encode(),f"membership|1|synthetic sender|{guid}|{code}|1|{observed}|{scope}".encode(),hashlib.sha256).hexdigest()[:32]
        body=dict(character=name,guid=guid,code=code,source="whisper",ts=observed,nativeMembership=dict(version=1,member=True,observedAt=observed,scopeHash=scope,mac=mac))
        self.w.verification_roster_ready=lambda *a:False
        with patch.object(watcher,"log",self.logs.append):
            for _ in range(3):
                with self.assertRaises(watcher.VerificationDeferred): self.w._post_claimed("/ingest/verify",body,"synthetic",["source-original"])
            self.w.verification_roster_ready=lambda *a:True
            self.w.worker.call=lambda *a,**k:(self.calls.append(a) or (False,{}))
            self.w._post_claimed("/ingest/verify",body,"synthetic",["source-original"]);self.w.flush_outbox()
        self.assertEqual(len(self.calls),1);self.assertEqual(sum("request attempt:" in s for s in self.logs),1)
        self.assertEqual(sum("verification waiting" in s for s in self.logs),1);self.assertFalse(any("forwarding" in s or "delivered" in s for s in self.logs))

    @unittest.skipUnless(os.name=="nt","Windows console wrapper qualification")
    def test_noninteractive_console_exits_without_restart_and_preserves_quoted_args(self):
        source=Path(__file__).resolve().parents[1]/"run-watcher.cmd"; target=self.root/"run-watcher.cmd";target.write_bytes(source.read_bytes())
        # Use a real Python child that returns to the batch wrapper. A python.cmd
        # substitute would transfer batch control and never exercise its branch.
        (self.root/"watcher.py").write_text('import json,sys\nfrom pathlib import Path\nPath("received.json").write_text(json.dumps(sys.argv))\nraise SystemExit(23)\n',encoding="utf-8")
        env={**os.environ,"OLYMPUS_WATCHER_NONINTERACTIVE":"1","PATH":str(Path(sys.executable).parent)+os.pathsep+os.environ.get("PATH","")}
        result=subprocess.run(["cmd.exe","/d","/c",str(target),"--wow-dir",r"C:\Synthetic Client"],cwd=self.root,env=env,capture_output=True,timeout=5)
        self.assertEqual(result.returncode,23);received=json.loads((self.root/"received.json").read_text(encoding="utf-8"))
        self.assertEqual(received[-2:],["--wow-dir",r"C:\Synthetic Client"]);self.assertNotIn("Press a key",result.stdout.decode(errors="replace"))


if __name__ == "__main__": unittest.main()

"""Synthetic owned-State/transport tests; never opens operator data or a provider."""
from __future__ import annotations
import copy
import importlib
import json
import os
from pathlib import Path
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
sys.path.insert(0, os.environ.get("LOCAL_PRIVACY_TEST_SOURCE", str(Path(__file__).resolve().parents[1])))
import watcher
import intake242
import intake_schema280

FIELD = "localPrivacyDisposition280"
NOW = int(time.time())


def legacy(eid="old-synthetic-donation", source="mail", note="Private synthetic correspondence"):
    return dict(id=eid, type="donation", source=source, character="Synthetic Sender", guid="Player-1-AAAABBBB", requestedAt=NOW-300,
                requestedBy="Fern Melder", clientVersion="0.6.25", guild="OLYMPUS PRIME", realm="ForeverPvE",
                donation=dict(copper=123, outgoingCopper=0, items=[dict(id=123, name="Preserved structured item", link="item:123", count=2)], note=note))


def ordinary(eid="new-verification"):
    return dict(id=eid, type="verify", source="native-whisper-event242", character="Synthetic Sender", guid="Player-1-AAAABBBB",
                code="ABCDEFG", requestedAt=NOW-30)


def current(eid="b"*24):
    body = dict(id=eid, type="donation", source=intake_schema280.V2, character="Synthetic Sender", guid="Player-1-AAAABBBB",
                requestedAt=int(time.time())-10, requestedBy="Fern Melder", clientVersion="0.6.35", guild="OLYMPUS PRIME", realm="ForeverPvE",
                donation=dict(version=2, kind="trade", copper=123, recipient="Fern Melder", collectorGuid="Player-1-CCCCDDDD", reference="TITHE-ABCD-EFGH"),
                evidence=dict(kind="trade_complete_and_money_delta", confirmedLocal=True, automaticCredit=False, mac=""))
    body["evidence"]["mac"] = intake_schema280.tithe_mac("synthetic-key", body)
    return body


def row(body, state="pending"):
    _, digest = intake242._canonical_body(body)
    return dict(body=copy.deepcopy(body), sha256=digest, payloadHash="unchanged-original-hash", mac="unchanged-original-mac", state=state,
                attempted=state != "pending", attempts=3, retrySchedule280={"spent":True,"nextAt":NOW-100,"receipt":{"originalNoEffect":False}},
                collectorRetry280={"spent":True,"nextAt":NOW-101,"receipt":{}}, outcome="unchanged", acknowledgedAt=NOW-20,
                receipt=dict(id=body["id"],status="done",character=body["character"],guid=body["guid"],discordRole="",outcome="original"))


def marker(ids=(), transfers=()):
    return dict(version=1,purpose="financial-correspondence-local-only-v1",blockedIds=dict.fromkeys(ids,True),
                blockedTransferIds=dict.fromkeys(transfers,True),retiredDeclarations=[],
                stats=dict(blankedLeaves=0,retiredKeyCount=0,blockedOriginals=len(ids),blockedTransfers=len(transfers)))


class Harness(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup); self.root=Path(temp.name)
        self.path=self.root/"state.json"
        self.cfg=dict(wow_dir=str(self.root),account="SYNTHETIC",worker_url="https://test.invalid",watcher_token="synthetic-token",
                      verify_secret="synthetic-key",officer_character="Fern Melder",state_file=str(self.path),membership_only=True)
    def seed(self, entries, **extra):
        value=dict(intake242=entries,outbox=[],seen=[],trusted_keys_since=NOW-1000,**extra)
        self.path.write_text(json.dumps(value),encoding="utf-8"); return value
    def loaded(self, entries=None):
        if entries is not None: self.seed(entries)
        obj=watcher.Watcher(self.cfg); obj.worker.paused=lambda:None; return obj
    def source(self, value=None):
        data={"OlympusVerifyDB":{"intake242":value or {"entries":{}}}}
        return patch.object(intake242.savedvars_source280,"owned",return_value=SimpleNamespace(data=data))


class StartupBehavior(Harness):
    def test_actual_constructor_blanks_only_note_before_first_consumer_and_preserves_originals(self):
        entries={str(i):row(legacy(str(i),source),state) for i,(source,state) in enumerate(zip(
                 ("mail","trade","whisper-declaration","treasury-receipt242"),("pending","done","rejected","outcome_unknown")))}
        original=self.seed(entries,unrelated={"note":"Outside owned scope"})
        observed=[]; actual=watcher.TreasuryJournal
        def first_consumer(*args,**kwargs):
            observed.append(json.loads(self.path.read_text(encoding="utf-8")))
            return actual(*args,**kwargs)
        with patch.object(watcher,"TreasuryJournal",side_effect=first_consumer): obj=self.loaded()
        self.assertEqual(len(observed),1)
        for eid, old in original["intake242"].items():
            got=copy.deepcopy(observed[0]["intake242"][eid]); self.assertIn(FIELD,got); meta=got.pop(FIELD)
            self.assertFalse(meta["relayEligible"]); self.assertEqual(meta["version"],1)
            self.assertEqual(got["body"]["donation"].pop("note"),"")
            expected=copy.deepcopy(old); expected["body"]["donation"].pop("note")
            self.assertEqual(got,expected)
        self.assertEqual(obj.state.d["unrelated"],original["unrelated"])
        first=copy.deepcopy(obj.state.d["intake242"]); again=self.loaded()
        self.assertEqual(again.state.d["intake242"],first)

    def test_preexisting_fixed_staging_holds_cleanup_without_stopping_other_consumers(self):
        self.seed({"old":row(legacy("old"))}); raw=self.path.read_bytes()
        staged=self.path.with_suffix(".tmp"); staged.write_bytes(b"unresolved synthetic staged original")
        with patch.object(watcher,"TreasuryJournal") as consume:
            obj=self.loaded()
        consume.assert_called_once(); self.assertFalse(obj._local_correspondence_status280["complete"])
        self.assertFalse(obj._custody_halted);self.assertEqual(self.path.read_bytes(),raw)
        self.assertEqual(staged.read_bytes(),b"unresolved synthetic staged original")

    def test_duplicate_keys_refused_from_single_owned_read_without_rewrite(self):
        raw=b'{"outbox":[],"seen":[],"intake242":{},"intake242":{}}'; self.path.write_bytes(raw)
        with patch.object(watcher,"TreasuryJournal") as consume:
            with self.assertRaises(ValueError): self.loaded()
        consume.assert_not_called(); self.assertEqual(self.path.read_bytes(),raw)

    def test_nonfinite_literal_and_exponent_refused_without_rewrite(self):
        for value in ("NaN","Infinity","-Infinity","1e999"):
            with self.subTest(value=value):
                raw=('{"outbox":[],"seen":[],"value":'+value+'}').encode(); self.path.write_bytes(raw)
                with self.assertRaises(ValueError): self.loaded()
                self.assertEqual(self.path.read_bytes(),raw)

    def test_malformed_recognized_old_row_is_held_while_other_rows_are_minimized(self):
        entries={"good":row(legacy("good")),"bad":row(legacy("bad",note=12))}; original=self.seed(entries)
        obj=self.loaded(); self.assertEqual(obj.state.d["intake242"]["bad"],original["intake242"]["bad"])
        good=copy.deepcopy(obj.state.d["intake242"]["good"]);good.pop(FIELD)
        self.assertEqual(good["body"]["donation"]["note"],"");good["body"]["donation"]["note"]="Private synthetic correspondence"
        self.assertEqual(good,original["intake242"]["good"])
        self.assertTrue(hasattr(obj,"_local_correspondence_status280")); self.assertFalse(obj._local_correspondence_status280["complete"])
        self.assertFalse(obj._custody_halted)


class TransportBehavior(Harness):
    def test_historical_bridge_and_mirror_labels_are_blanked_and_denied_before_hash(self):
        for source in ("addon-bridge242", "Olympus-pendingRoleUpdates", "OlympusRecordDB-pendingRoleUpdates"):
            with self.subTest(source=source):
                body=legacy("historical-bridge",source);body.update(bridgeUntrusted=True,bridgeSender="Synthetic Officer",untrustedSources=[source])
                body["evidence"]=dict(kind="remote-unconfirmed-declaration",confirmedLocal=False,automaticCredit=False)
                old=row(body,"outcome_unknown");obj=self.loaded({body["id"]:old})
                actual=copy.deepcopy(obj.state.d["intake242"][body["id"]]);meta=actual.pop(FIELD)
                self.assertFalse(meta["relayEligible"]);actual["body"]["donation"]["note"]=old["body"]["donation"]["note"]
                self.assertEqual(actual,old)
                with self.source(),patch.object(intake242,"_canonical_body",side_effect=AssertionError("retired bridge hashed")),patch.object(obj.worker,"call") as call:
                    intake242.drain(obj,False);self.assertEqual(intake242.receipts(obj),[])
                call.assert_not_called()

    def test_unknown_financial_item_does_not_prevent_recognized_item_cleanup(self):
        bad=legacy("unknown");bad["unexpectedHistoricalField"]="Preserve unknown original"
        old=row(bad,"outcome_unknown");obj=self.loaded({"good":row(legacy("good")),"unknown":old})
        self.assertEqual(obj.state.d["intake242"]["good"]["body"]["donation"]["note"],"")
        self.assertEqual(obj.state.d["intake242"]["unknown"],old)
        self.assertFalse(obj._local_correspondence_status280["complete"])
        self.assertGreater(obj._local_correspondence_status280["heldRows"],0)

    def test_stale_staging_only_holds_cleanup_and_is_not_adopted(self):
        self.seed({"old":row(legacy("old"))});staged=self.path.with_suffix(".tmp")
        staged.write_bytes(b"unresolved synthetic staged data")
        obj=self.loaded();self.assertFalse(obj._custody_halted)
        self.assertFalse(obj._local_correspondence_status280["complete"])
        self.assertEqual(obj.state.d["intake242"]["old"]["body"]["donation"]["note"],"Private synthetic correspondence")
        self.assertEqual(staged.read_bytes(),b"unresolved synthetic staged data")
        obj.state.save() # The existing normal-save policy is unchanged.
        self.assertFalse(staged.exists())
        self.assertEqual(json.loads(self.path.read_text())["intake242"]["old"]["body"]["donation"]["note"],"Private synthetic correspondence")

    def test_unrelated_ordinary_capacity_does_not_disable_known_text_cleanup(self):
        self.seed({"old":row(legacy("old")),"ordinary":dict(body=ordinary(),unrelatedPadding=[0]*270000)})
        obj=self.loaded();self.assertEqual(obj.state.d["intake242"]["old"]["body"]["donation"]["note"],"")
        self.assertEqual(len(obj.state.d["intake242"]["ordinary"]["unrelatedPadding"]),270000)

    def test_partial_startup_log_reports_only_fixed_status_counts_and_reason(self):
        bad=legacy("bad",note=12)
        self.seed({"old":row(legacy("old")),"bad":row(bad)})
        with patch.object(watcher,"log") as log:
            obj=self.loaded()
        lines=[str(c.args[0]) for c in log.call_args_list if "correspondence cleanup" in str(c.args[0])]
        self.assertEqual(len(lines),1);self.assertIn("blanked 1, held 1",lines[0]);self.assertIn("scoped-minimization-incomplete",lines[0])
        self.assertNotIn("Private synthetic correspondence",lines[0]);self.assertNotIn("Synthetic Sender",lines[0])

    def test_unknown_financial_shape_remains_unchanged_and_cannot_reach_hashing(self):
        body=legacy("unrecognized","future-unsupported-origin");old=row(body);obj=self.loaded({body["id"]:old})
        with self.source(dict(entries={body["id"]:body},localCorrespondence280=marker())),patch.object(intake242,"_canonical_body",side_effect=AssertionError("unknown financial body hashed")),patch.object(obj.worker,"call") as call:
            intake242.collect(obj);intake242.drain(obj,False)
        call.assert_not_called();self.assertEqual(obj.state.d["intake242"][body["id"]],old)

    def test_current_label_with_unknown_note_is_held_unchanged_and_counted(self):
        body=current();body['donation']['note']='Unknown shape must stay exact'
        old=row(body);obj=self.loaded({'good':row(legacy('good')),body['id']:old})
        status=obj._local_correspondence_status280
        self.assertFalse(status['complete']);self.assertEqual(status['heldRows'],1);self.assertEqual(status['blankedNotes'],1)
        self.assertEqual(obj.state.d['intake242'][body['id']],old)
        with self.source(dict(entries={body['id']:body},localCorrespondence280=marker())),patch.object(intake242,'_canonical_body',side_effect=AssertionError('unknown current-label shape hashed')),patch.object(obj.worker,'call') as call:
            intake242.collect(obj);intake242.drain(obj,False)
        call.assert_not_called();self.assertEqual(obj.state.d['intake242'][body['id']],old)

    def test_current_label_with_nonscalar_clock_or_mac_is_held_and_counted(self):
        for field in ['requestedAt','mac']:
            with self.subTest(field=field):
                body=current();target=body if field=='requestedAt' else body['evidence'];target[field]={'text':'Unknown correspondence shape'}
                old=row(body);obj=self.loaded({'good':row(legacy('good')),body['id']:old})
                status=obj._local_correspondence_status280
                self.assertFalse(status['complete']);self.assertEqual(status['heldRows'],1);self.assertEqual(status['blankedNotes'],1)
                self.assertEqual(obj.state.d['intake242'][body['id']],old)
                with self.source(dict(entries={body['id']:body},localCorrespondence280=marker())),patch.object(intake242,'_canonical_body',side_effect=AssertionError('nonscalar receipt hashed')),patch.object(obj.worker,'call') as call:
                    intake242.collect(obj);intake242.drain(obj,False)
                call.assert_not_called();self.assertEqual(obj.state.d['intake242'][body['id']],old)

    def _sticky_current_policy_recovery(self, mode, expected):
        # Only the constructor's synthetic dictionary changes; no operator config
        # or live state is read. Original body/MAC/hash/clock stay frozen.
        at=NOW;body=current()
        if mode == "future-clock":
            body["requestedAt"]=at+120
            body["evidence"]["mac"]=intake_schema280.tithe_mac("synthetic-key",body)
        elif mode == "wrong-key": self.cfg["verify_secret"]="wrong-synthetic-key"
        else: self.cfg["officer_character"]="Another Synthetic Officer"
        original=row(body);obj=self.loaded({body["id"]:original})
        readable=dict(entries={},localCorrespondence280=marker())
        with patch.object(intake242.time,"time",return_value=at),self.source(readable),patch.object(obj.worker,"call",return_value=(False,{})) as first:
            intake242.drain(obj,False)
        initial=obj.state.d["intake242"][body["id"]].get("policyHold")
        with patch.object(intake242.time,"time",return_value=at+121),self.source(readable),patch.object(obj.worker,"call",return_value=(False,{})) as later:
            intake242.drain(obj,False)
        obj.state.save()
        self.cfg["verify_secret"]="synthetic-key";self.cfg["officer_character"]="Fern Melder"
        with patch.object(intake242.time,"time",return_value=at+121): restarted=self.loaded()
        with patch.object(intake242.time,"time",return_value=at+121),self.source(readable),patch.object(restarted.worker,"call",return_value=(False,{})) as after_restart:
            intake242.drain(restarted,False)
        calls=dict(first=first.call_count,later=later.call_count,restarted=after_restart.call_count)
        self.assertEqual(initial,expected,calls)
        self.assertEqual(calls,dict(first=0,later=0,restarted=0))
        wanted=copy.deepcopy(original);wanted["policyHold"]=expected
        self.assertEqual(restarted.state.d["intake242"][body["id"]],wanted)

    def test_readable_marker_future_clock_hold_survives_later_drain_and_restart(self):
        self._sticky_current_policy_recovery("future-clock","receipt_original_clock_held")

    def test_readable_marker_wrong_key_hold_survives_correct_key_restart(self):
        self._sticky_current_policy_recovery("wrong-key","receipt_authentication_held")

    def test_readable_marker_officer_config_hold_survives_corrected_config(self):
        self._sticky_current_policy_recovery("wrong-officer","receipt_collector_held")

    def test_readable_marker_acked_receipt_keeps_original_24h_projection_across_30day_boundary(self):
        at=NOW;body=current();body["requestedAt"]=at-30*86400+300
        body["evidence"]["mac"]=intake_schema280.tithe_mac("synthetic-key",body)
        original=row(body,"done");obj=self.loaded({body["id"]:original})
        readable=dict(entries={},localCorrespondence280=marker())
        with patch.object(intake242.time,"time",return_value=at),self.source(readable): first=intake242.receipts(obj)
        with patch.object(intake242.time,"time",return_value=at+600),self.source(readable): later=intake242.receipts(obj)
        with patch.object(intake242.time,"time",return_value=original["acknowledgedAt"]+86400),self.source(readable): expired=intake242.receipts(obj)
        self.assertEqual((len(first),len(later),len(expired)),(1,1,0))
        self.assertEqual(first,later)
        self.assertEqual(later[0]["observedAt"],original["acknowledgedAt"])
        self.assertEqual(later[0]["expiresAt"],original["acknowledgedAt"]+86400)
        self.assertEqual(obj.state.d["intake242"][body["id"]],original)

    def test_unknown_marker_still_checks_full_current_clock_before_hash_or_hold(self):
        at=NOW;body=current();body["requestedAt"]=at+120
        body["evidence"]["mac"]=intake_schema280.tithe_mac("synthetic-key",body)
        original=row(body);obj=self.loaded({body["id"]:original});bad=marker();bad["version"]=2
        with patch.object(intake242.time,"time",return_value=at),self.source(dict(entries={body["id"]:body},localCorrespondence280=bad)),patch.object(intake242,"_canonical_body",side_effect=AssertionError("unknown-marker future body hashed")),patch.object(obj.worker,"call") as call:
            intake242.collect(obj);intake242.drain(obj,False)
        call.assert_not_called()
        self.assertEqual(obj.state.d["intake242"][body["id"]],original)

    def test_known_legacy_denied_before_hash_and_no_metadata_or_ack_mutation(self):
        obj=self.loaded({"old":row(legacy("old"),"done")}); original=copy.deepcopy(obj.state.d["intake242"])
        with self.source(),patch.object(intake242,"_canonical_body",side_effect=AssertionError("must not hash removed text")),patch.object(obj.worker,"call") as call:
            intake242.drain(obj,False); self.assertEqual(intake242.receipts(obj),[])
        call.assert_not_called(); self.assertEqual(obj.state.d["intake242"],original)

    def test_each_addon_deny_map_precedes_collect_hash_same_id_adoption_and_dispatch(self):
        for key in ("blockedIds","blockedTransferIds"):
            with self.subTest(key=key):
                eid="a"*24; body=current(eid); old=row(body); obj=self.loaded({eid:old}); original=copy.deepcopy(obj.state.d["intake242"])
                m=marker(); m[key][eid]=True
                with self.source(dict(entries={eid:body},localCorrespondence280=m)),patch.object(intake242,"_canonical_body",side_effect=AssertionError("blocked original hashed")),patch.object(obj.worker,"call") as call:
                    intake242.collect(obj); intake242.drain(obj,False); self.assertEqual(intake242.receipts(obj),[])
                call.assert_not_called(); self.assertEqual(obj.state.d["intake242"],original)

    def test_malformed_old_graph_and_marker_do_not_block_current_v2_or_verification(self):
        bodies=[current(),ordinary()]; entries={"bad":row(legacy("bad",note=12))}
        entries.update({b["id"]:row(b) for b in bodies}); obj=self.loaded(entries); calls=[]
        obj.worker.call=lambda *a,**k:(calls.append(copy.deepcopy(a)) or (False,{}))
        with self.source(dict(entries={},localCorrespondence280={"version":1})):
            intake242.drain(obj,False)
        self.assertEqual(len(calls),1); self.assertEqual({b["id"] for b in calls[0][2]["entries"]},{b["id"] for b in bodies})
        self.assertEqual(obj.state.d["intake242"]["bad"],entries["bad"]); self.assertFalse(obj._custody_halted)

    def test_source_label_does_not_allow_unqualified_financial_under_malformed_marker(self):
        body=current(); body["evidence"]["mac"]="0"*32; obj=self.loaded({body["id"]:row(body)}); original=copy.deepcopy(obj.state.d["intake242"])
        with self.source(dict(entries={},localCorrespondence280={})),patch.object(obj.worker,"call") as call:
            intake242.drain(obj,False)
        call.assert_not_called(); self.assertEqual(obj.state.d["intake242"],original)

    def test_late_ack_does_not_adopt_over_new_deny_metadata(self):
        body=ordinary(); obj=self.loaded({body["id"]:row(body)})
        def reply(*args,**kwargs):
            original=obj.state.d["intake242"][body["id"]]
            original[FIELD]={"malformed":"deny only"}
            return True,dict(version=242,acknowledgements=[dict(id=body["id"],status="done",character=body["character"],guid=body["guid"],outcome="okay")])
        obj.worker.call=reply
        with self.source(): intake242.drain(obj,False)
        retained=obj.state.d["intake242"][body["id"]]
        self.assertEqual(retained["state"],"pending"); self.assertEqual(retained["outcome"],"unchanged")
        self.assertEqual(retained[FIELD],{"malformed":"deny only"})


    def test_actual_owned_savedvariables_bad_stats_denies_target_before_hash(self):
        from test_tithe_policy280 import lua
        for field in ("blockedIds","blockedTransferIds"):
            with self.subTest(field=field):
                obj=self.loaded({});targeted=current("a"*24);targeted.update(status="pending",attempts=0,outcome="")
                unrelated=current("b"*24);m=marker();m[field][targeted["id"]]=True;m["stats"]["blankedLeaves"]="malformed"
                source=dict(intake242=dict(entries={targeted["id"]:targeted,unrelated["id"]:unrelated},localCorrespondence280=m))
                obj.sv_file.parent.mkdir(parents=True,exist_ok=True);obj.sv_file.write_text("OlympusVerifyDB="+lua(source),encoding="utf-8")
                actual=intake242._canonical_body;calls=[];obj.worker.call=lambda *a,**k:(calls.append(copy.deepcopy(a)) or (False,{}))
                def canonical(body):
                    self.assertNotEqual(body.get("id"),targeted["id"]);return actual(body)
                with patch.object(intake242,"_canonical_body",side_effect=canonical):intake242.collect(obj);intake242.drain(obj,False)
                self.assertNotIn(targeted["id"],obj.state.d["intake242"])
                self.assertEqual([r["id"] for r in calls[0][2]["entries"]],[unrelated["id"]])

    def test_exact_known_target_stays_denied_with_bad_stats_but_unrelated_v2_continues(self):
        for field in ("blockedIds","blockedTransferIds"):
            with self.subTest(field=field):
                targeted=current("a"*24);unrelated=current("b"*24);targeted.update(status="pending",attempts=0,outcome="")
                obj=self.loaded({});m=marker();m[field][targeted["id"]]=True;m["stats"]["blankedLeaves"]=float("inf")
                source=dict(entries={targeted["id"]:targeted,unrelated["id"]:unrelated},localCorrespondence280=m)
                calls=[];obj.worker.call=lambda *a,**k:(calls.append(copy.deepcopy(a)) or (False,{}))
                actual=intake242._canonical_body
                def canonical(body):
                    self.assertNotEqual(body.get("id"),targeted["id"],"known denied target reached hashing")
                    return actual(body)
                with self.source(source),patch.object(intake242,"_canonical_body",side_effect=canonical):
                    intake242.collect(obj);intake242.drain(obj,False)
                self.assertNotIn(targeted["id"],obj.state.d["intake242"])
                self.assertEqual([r["id"] for r in calls[0][2]["entries"]],[unrelated["id"]])
                retained=row(current(targeted["id"]),"done");obj.state.d["intake242"][targeted["id"]]=retained;before=copy.deepcopy(retained)
                with self.source(source),patch.object(intake242,"_canonical_body",side_effect=canonical):
                    self.assertEqual(intake242.receipts(obj),[]);intake242.drain(obj,False)
                self.assertEqual(retained,before)

    def test_raw_current_v2_volatile_fields_reach_original_validator_but_blocked_id_does_not(self):
        for blocked in (False,True):
            with self.subTest(blocked=blocked):
                obj=self.loaded({});body=current();body.update(status="pending",attempts=0,outcome="")
                m=marker([body["id"]]) if blocked else {"version":1}
                with self.source(dict(entries={body["id"]:body},localCorrespondence280=m)):
                    intake242.collect(obj)
                if blocked:self.assertNotIn(body["id"],obj.state.d["intake242"])
                else:
                    actual=obj.state.d["intake242"][body["id"]]
                    self.assertEqual(actual["body"],{k:v for k,v in body.items() if k not in intake242._VOLATILE})
                    self.assertEqual(actual["sha256"],intake242._canonical_body(body)[1])
                    self.assertIsNone(intake_schema280.financial_error(actual["body"],obj.secret,obj.officer))

    def test_new_addon_deny_marker_after_transport_prevents_ack_and_retry_adoption(self):
        body=current();obj=self.loaded({body["id"]:row(body)});counter=[0]
        empty=SimpleNamespace(data={"OlympusVerifyDB":{"intake242":{"entries":{}}}})
        blocked=SimpleNamespace(data={"OlympusVerifyDB":{"intake242":{"entries":{},"localCorrespondence280":marker([body["id"]])}}})
        def source(_):return empty if counter[0]==0 else blocked
        def reply(*a,**k):
            counter[0]+=1
            return True,dict(version=242,acknowledgements=[dict(id=body["id"],status="done",character=body["character"],guid=body["guid"],outcome="okay")])
        obj.worker.call=reply
        with patch.object(intake242.savedvars_source280,"owned",side_effect=source):intake242.drain(obj,False)
        retained=obj.state.d["intake242"][body["id"]]
        self.assertEqual(retained["state"],"pending");self.assertEqual(retained["outcome"],"unchanged")
        self.assertEqual(retained["acknowledgedAt"],NOW-20)

    def test_unavailable_source_preserves_current_v2_and_nonfinancial_original_validators(self):
        bodies=[current(),ordinary()];obj=self.loaded({b["id"]:row(b) for b in bodies});calls=[]
        obj.worker.call=lambda *a,**k:(calls.append(copy.deepcopy(a)) or (False,{}))
        with patch.object(intake242.savedvars_source280,"owned",side_effect=intake242.savedvars_source280.SourceUnavailable("synthetic unavailable")):
            intake242.drain(obj,False)
        self.assertEqual(len(calls),1);self.assertEqual({b["id"] for b in calls[0][2]["entries"]},{b["id"] for b in bodies})

    def test_same_id_old_source_cannot_replace_minimized_or_set_source_conflict(self):
        body=legacy("old");obj=self.loaded({body["id"]:row(body)});original=copy.deepcopy(obj.state.d["intake242"])
        body["donation"]["note"]="Different recaptured synthetic text"
        with self.source(dict(entries={body["id"]:body})),patch.object(intake242,"_canonical_body",side_effect=AssertionError("old source hashed")):
            intake242.collect(obj)
        self.assertEqual(obj.state.d["intake242"],original)

    def test_malformed_protective_metadata_never_creates_hash_or_retry_authority(self):
        body=ordinary();obj=self.loaded({body["id"]:row(body)});original=obj.state.d["intake242"][body["id"]]
        original[FIELD]={"version":0};original["attempted"]=True;before=copy.deepcopy(original)
        with self.source(),patch.object(intake242,"_canonical_body",side_effect=AssertionError("local-only row hashed")),patch.object(obj.worker,"call") as call:
            self.assertIsNone(intake242._ordinary_retry_witness(obj,original));intake242.drain(obj,False);self.assertEqual(intake242.receipts(obj),[])
        call.assert_not_called();self.assertEqual(original,before)


class LocalPrimitive(Harness):
    def helper(self): return importlib.import_module("local_correspondence280")
    def test_copy_on_write_preserves_source_graph_and_first_disposition_clock(self):
        p=self.helper(); state=SimpleNamespace(d={"intake242":{"old":row(legacy("old"))},"unchanged":{"x":1}}); old=copy.deepcopy(state.d)
        candidate,status=p.prepare(state,NOW); self.assertTrue(status["complete"]); self.assertEqual(state.d,old)
        self.assertIsNot(candidate["intake242"],state.d["intake242"]); self.assertIs(candidate["unchanged"],state.d["unchanged"])
        state.d=candidate; candidate["intake242"]["old"]["body"]["donation"]["note"]="new synthetic capture"
        again,status=p.prepare(state,NOW+30); self.assertEqual(again["intake242"]["old"][FIELD]["removedAt"],NOW)

    def test_save_before_commit_failure_and_commit_then_lost_answer_stop_globally(self):
        p=self.helper()
        for commit in (False,True):
            with self.subTest(commit=commit):
                self.seed({"old":row(legacy("old"))}); raw=self.path.read_bytes(); calls=[]
                actual=watcher.State.save
                def failed(state):
                    calls.append(copy.deepcopy(state.d))
                    if commit: actual(state)
                    raise OSError("synthetic lost persistence outcome")
                with patch.object(watcher.State,"save",failed),patch.object(watcher,"TreasuryJournal") as consume:
                    with self.assertRaises(OSError): self.loaded()
                consume.assert_not_called(); self.assertEqual(len(calls),1)
                disk=json.loads(self.path.read_text(encoding="utf-8"))
                self.assertEqual(disk["intake242"]["old"]["body"]["donation"]["note"],"" if commit else "Private synthetic correspondence")
                if not commit:self.assertEqual(self.path.read_bytes(),raw)
                else:self.assertIn(FIELD,self.loaded().state.d["intake242"]["old"])

    def test_atomic_replace_failure_retains_original_then_restart_only_holds_cleanup(self):
        self.seed({"old":row(legacy("old"))}); raw=self.path.read_bytes()
        with patch.object(watcher.os,"replace",side_effect=OSError("synthetic replacement unavailable")):
            with self.assertRaises(OSError):self.loaded()
        self.assertEqual(self.path.read_bytes(),raw); staged=self.path.with_suffix(".tmp"); self.assertTrue(staged.exists())
        staged_raw=staged.read_bytes()
        obj=self.loaded();self.assertFalse(obj._local_correspondence_status280["complete"]);self.assertFalse(obj._custody_halted)
        self.assertEqual(staged.read_bytes(),staged_raw); self.assertEqual(self.path.read_bytes(),raw)

    def test_unknown_malformed_disposition_is_denial_and_not_repaired(self):
        p=self.helper(); obj=self.loaded({"old":row(legacy("old"))}); original=obj.state.d["intake242"]["old"]
        original[FIELD]={"version":2}; kept=copy.deepcopy(original)
        candidate,status=p.prepare(obj.state,NOW+20); self.assertIsNone(candidate); self.assertFalse(status["complete"])
        self.assertTrue(p.local_only(original)); self.assertEqual(original,kept)

    def test_current_scalar_treasury_and_structured_items_stay_untouched(self):
        p=self.helper(); scalar={"entryId":"scalar-v1","copper":12,"sender":"Synthetic Sender","note":"not an inventoried intake row"}
        state=SimpleNamespace(d={"treasury":scalar,"intake242":{}}); before=copy.deepcopy(state.d)
        candidate,status=p.prepare(state,NOW);self.assertIsNone(candidate);self.assertTrue(status["complete"]);self.assertEqual(state.d,before)

    def test_marker_closed_safe_integers_dense_archive_and_both_maps(self):
        p=self.helper(); m=marker(["a"*24],["b"*32]);m["retiredDeclarations"]={1:{"entryId":"a"*24,"reason":"retired-local-correspondence-key-v1"},2:{"entryId":"a"*24,"reason":"retired-local-correspondence-key-v1"}}
        ids,bad=p.addon_marker({"localCorrespondence280":m});self.assertFalse(bad);self.assertEqual(ids,{"a"*24,"b"*32})
        for v in (True,-1,1.5,2**53,float("inf"),"1"):
            invalid=copy.deepcopy(m);invalid["stats"]["blankedLeaves"]=v
            self.assertTrue(p.addon_marker({"localCorrespondence280":invalid})[1])

    def test_known_target_salvage_is_exact_closed_literal_denial_only(self):
        p=self.helper();eid="a"*24;m=marker([eid]);m["stats"]={"malformed":True}
        self.assertTrue(p.addon_target_denied({"localCorrespondence280":m},eid))
        for key,value in (("version",True),("version",2),("purpose","foreign"),("blockedIds",{eid:1}),("blockedIds",{eid:"true"}),("blockedIds",[])):
            bad=copy.deepcopy(m);bad[key]=value
            self.assertFalse(p.addon_target_denied({"localCorrespondence280":bad},eid))
        self.assertFalse(p.addon_target_denied({"localCorrespondence280":m},"b"*24))
        self.assertFalse(p.addon_target_denied({"localCorrespondence280":m},eid.upper()))

    def test_complete_preflight_refuses_non_json_cycles_and_aliases_without_partial_mutation(self):
        p=self.helper()
        variants=[]
        cycle={};cycle["self"]=cycle;variants.append(cycle)
        alias={};variants.append({"a":alias,"b":alias})
        for value in variants:
            state=SimpleNamespace(d={"intake242":{"old":row(legacy("old")),"unknown":{"body":value}}})
            candidate,status=p.prepare(state,NOW);self.assertIsNone(candidate);self.assertFalse(status["complete"])
            self.assertEqual(state.d["intake242"]["old"]["body"]["donation"]["note"],"Private synthetic correspondence")

    def test_unrelated_oversized_or_deep_history_stays_exact_during_scoped_cleanup(self):
        p=self.helper();deep={};head=deep
        for _ in range(35):head["x"]={};head=head["x"]
        for value in (deep,{"huge":"x"*(16777216+1)}):
            unknown={"body":value};state=SimpleNamespace(d={"intake242":{"old":row(legacy("old")),"unknown":unknown}})
            candidate,status=p.prepare(state,NOW);self.assertFalse(status["complete"])
            self.assertIs(candidate["intake242"]["unknown"],unknown)
            self.assertEqual(candidate["intake242"]["old"]["body"]["donation"]["note"],"")
            self.assertEqual(state.d["intake242"]["old"]["body"]["donation"]["note"],"Private synthetic correspondence")

    def capacity_state(self, field):
        return SimpleNamespace(d={"intake242":{"old":row(legacy("old")),"padding":{field:[] if field=="values" else ""}}},path=self.path)
    def assert_generated_held_without_save(self, state):
        p=self.helper();original=state.d;old=copy.deepcopy(state.d["intake242"]["old"])
        candidate,status=p.prepare(state,NOW)
        self.assertTrue(candidate is None,"generated candidate must be held");self.assertFalse(status["complete"]);self.assertTrue(status["held"])
        self.assertIs(state.d,original);self.assertEqual(state.d["intake242"]["old"],old)
        with patch.object(state,"save",create=True) as save:
            status=p.initialize(state);self.assertFalse(status["complete"]);save.assert_not_called()
        self.assertIs(state.d,original);self.assertEqual(state.d["intake242"]["old"],old)
    def test_generated_field_capacity_holds_without_save_and_exact_boundary_succeeds(self):
        p=self.helper();state=self.capacity_state("values");base=p._bounded(state.d["intake242"])["fields"]
        state.d["intake242"]["padding"]["values"]=[0]*(p._LIMITS["fields"]-1-base)
        self.assertEqual(p._bounded(state.d["intake242"])["fields"],p._LIMITS["fields"]-1)
        self.assert_generated_held_without_save(state)
        # A disposition adds exactly six fields (row pointer plus five fixed fields).
        state.d["intake242"]["padding"]["values"]=[0]*(p._LIMITS["fields"]-6-base)
        candidate,status=p.prepare(state,NOW);self.assertTrue(status["complete"])
        self.assertEqual(p._bounded(candidate["intake242"])["fields"],p._LIMITS["fields"])
    def test_generated_table_capacity_holds_without_save_and_exact_boundary_succeeds(self):
        p=self.helper();state=self.capacity_state("values");base=p._bounded(state.d["intake242"])["tables"]
        state.d["intake242"]["padding"]["values"]=[{} for _ in range(p._LIMITS["tables"]-base)]
        self.assertEqual(p._bounded(state.d["intake242"])["tables"],p._LIMITS["tables"])
        self.assert_generated_held_without_save(state)
        state.d["intake242"]["padding"]["values"].pop()
        candidate,status=p.prepare(state,NOW);self.assertTrue(status["complete"])
        self.assertEqual(p._bounded(candidate["intake242"])["tables"],p._LIMITS["tables"])
    def test_generated_byte_capacity_holds_without_save_and_exact_boundary_succeeds(self):
        p=self.helper();state=self.capacity_state("text");base=p._bounded(state.d["intake242"])["bytes"]
        small,status=p.prepare(state,NOW);delta=p._bounded(small["intake242"])["bytes"]-base;self.assertGreater(delta,0)
        state.d["intake242"]["padding"]["text"]="x"*(p._LIMITS["bytes"]-base-delta+1)
        self.assertLessEqual(p._bounded(state.d["intake242"])["bytes"],p._LIMITS["bytes"])
        self.assert_generated_held_without_save(state)
        state.d["intake242"]["padding"]["text"]=state.d["intake242"]["padding"]["text"][:-1]
        candidate,status=p.prepare(state,NOW);self.assertTrue(status["complete"])
        self.assertEqual(p._bounded(candidate["intake242"])["bytes"],p._LIMITS["bytes"])

    def test_thousand_rich_rows_minimize_bounded_scope_without_fact_or_hash_changes(self):
        p=self.helper();entries={str(i):row(legacy(str(i))) for i in range(1000)}
        for r in entries.values():r["body"]["donation"]["items"]=[dict(id=i,name="Structured item",link="item:"+str(i),count=2) for i in range(16)]
        state=SimpleNamespace(d={"intake242":entries});candidate,status=p.prepare(state,NOW)
        self.assertTrue(status["complete"]);self.assertEqual(status["blankedNotes"],1000)
        for eid,new in candidate["intake242"].items():
            self.assertEqual(new["sha256"],entries[eid]["sha256"]);self.assertEqual(new["body"]["donation"]["items"],entries[eid]["body"]["donation"]["items"])
            self.assertEqual(new["body"]["donation"]["note"],"")


if __name__=="__main__":unittest.main()

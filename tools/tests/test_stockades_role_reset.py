"""Offline contract tests for the fixed-scope Stockades role-reset operator.

Run: python tools/tests/test_stockades_role_reset.py
No Discord credentials, HTTP server, Worker, D1 database or live role is used.
"""
from __future__ import annotations

import copy
import contextlib
import http.client
import importlib.util
import io
import json
import pathlib
import sqlite3
import socket
import sys
import tempfile
import unittest
import urllib.parse
import urllib.error
from unittest import mock


HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("stockades_role_reset", HERE.parent / "stockades-role-reset.py")
assert SPEC is not None and SPEC.loader is not None
reset = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = reset
SPEC.loader.exec_module(reset)


def setUpModule():
    # No test, including CLI/real transport adapters, may reach the network.
    global NETWORK_GUARD, NETWORK_BLOCKERS
    NETWORK_GUARD = contextlib.ExitStack()
    NETWORK_BLOCKERS = []
    for target in ("socket.socket.connect", "socket.socket.connect_ex", "socket.create_connection", "socket.getaddrinfo"):
        NETWORK_BLOCKERS.append(NETWORK_GUARD.enter_context(mock.patch(target, side_effect=AssertionError("Offline suite forbids network"))))


def tearDownModule():
    attempts = sum(blocker.call_count for blocker in NETWORK_BLOCKERS)
    NETWORK_GUARD.close()
    if attempts:
        raise AssertionError(f"Offline suite observed {attempts} forbidden network attempts")

GUILD = "1549537348516188200"
BOT = "1800000000000000001"
MEMBER = "1800000000000000010"
MEMBER_TWO = "1800000000000000020"
MEMBER_THREE = "1800000000000000030"
EXPECTED_ROLES = (
    "1549581282227265566", "1555039815395713136", "1549582112636665996",
    "1549582122971562075", "1549582133197017290", "1549582202126344283",
    "1549582423992574094", "1549582577575137340", "1549582703442137251",
    "1549582829896208465", "1549582894161199246", "1549583033198317678",
    "1549583125368279161", "1549583202744533022",
)
ROLE_NAMES = (
    "Guild Member", "Veteran", "Tank", "Healer", "DPS", "Druid", "Hunter",
    "Mage", "Paladin", "Priest", "Rogue", "Shaman", "Warlock", "Warrior",
)
PROTECTED = (
    ("1549892601170108416", "Guild Master"),
    ("1549581882549608579", "Guild Leader"),
    ("1549581792015814676", "Moderator"),
    ("1549581672272625734", "Officer"),
    ("1549581447768186960", "Raid Leader"),
    ("1550178134878584934", "Olympus Verify"),
    ("1549597720291975243", "MEE6"),
    ("1555410397400666132", "GM (Beta Guilds)"),
    ("1555412894072569907", "Co-GM (Beta Guilds)"),
    ("1555413325787963492", "Non-Official Officers (Beta Guilds)"),
    ("1550188407244849253", "Battle.net Linked"),
    ("1552310260625182720", "Server Booster"),
)
BOT_ROLE = "1550178134878584934"
STAFF_ROLE = "1549581792015814676"
LINKED_ROLE = "1550188407244849253"
BOOSTER_ROLE = "1552310260625182720"
AT = 1793192400


def role(role_id: str, name: str, position: int, permissions: str = "0", managed: bool = False) -> dict:
    return {"id": role_id, "name": name, "position": position, "permissions": permissions,
            "managed": managed, "hoist": False, "mentionable": False, "color": 0}


def member(member_id: str, roles=(), bot: bool = False) -> dict:
    return {"user": {"id": member_id, "username": "offline-test-" + member_id[-3:], "bot": bot},
            "roles": list(roles), "nick": None, "joined_at": "2026-10-01T00:00:00Z"}


class FakeApi:
    """Documented REST surface only; every side effect is observable to tests."""

    def __init__(self):
        self.calls: list[tuple[str, str]] = []
        self.roles = [role(GUILD, "@everyone", 0)]
        self.roles += [role(rid, name, index + 1) for index, (rid, name) in enumerate(zip(EXPECTED_ROLES, ROLE_NAMES))]
        self.roles += [role(rid, name, 30 + index) for index, (rid, name) in enumerate(PROTECTED)]
        next(r for r in self.roles if r["id"] == BOT_ROLE).update(position=25, permissions=str(1 << 28), managed=True)
        self.members = {
            BOT: member(BOT, [BOT_ROLE], bot=True),
            MEMBER: member(MEMBER, [EXPECTED_ROLES[0], EXPECTED_ROLES[1], STAFF_ROLE, LINKED_ROLE]),
            MEMBER_TWO: member(MEMBER_TWO, [EXPECTED_ROLES[2], BOOSTER_ROLE]),
            MEMBER_THREE: member(MEMBER_THREE, [EXPECTED_ROLES[13]]),
        }
        self.delete_mode: str | None = None
        self.list_transform = None
        self.after_delete = None

    @property
    def deletes(self):
        return [path for method, path in self.calls if method == "DELETE"]

    def request(self, method: str, path: str):
        self.calls.append((method, path))
        parsed = urllib.parse.urlsplit(path)
        bits = parsed.path.strip("/").split("/")
        if method == "GET" and bits == ["users", "@me"]:
            return copy.deepcopy(self.members[BOT]["user"])
        if len(bits) < 2 or bits[:2] != ["guilds", GUILD]:
            raise AssertionError("Unexpected or wrong-guild request: " + method + " " + path)
        if method == "GET" and len(bits) == 2:
            return {"id": GUILD, "name": "Olympus: The Stockades & Court of Appeals",
                    "owner_id": "1800000000000000099", "member_count": len(self.members)}
        if method == "GET" and bits[2:] == ["roles"]:
            return copy.deepcopy(self.roles)
        if method == "GET" and bits[2:] == ["members"]:
            query = urllib.parse.parse_qs(parsed.query)
            after = int(query.get("after", ["0"])[0])
            limit = int(query.get("limit", ["1"])[0])
            if not 1 <= limit <= 1000:
                raise AssertionError("Invalid Discord member-page limit")
            page = [copy.deepcopy(self.members[k]) for k in sorted(self.members, key=int) if int(k) > after][:limit]
            return self.list_transform(page, after) if self.list_transform else page
        if method == "GET" and len(bits) == 4 and bits[2] == "members":
            if bits[3] not in self.members:
                raise AssertionError("Fixture lacks requested member " + bits[3])
            return copy.deepcopy(self.members[bits[3]])
        if method == "DELETE" and len(bits) == 6 and bits[2] == "members" and bits[4] == "roles":
            subject, requested = bits[3], bits[5]
            if requested not in EXPECTED_ROLES:
                raise AssertionError("Attempt to remove a protected/unselected role")
            if self.delete_mode == "unknown-present":
                raise TimeoutError("synthetic request outcome unknown")
            if self.delete_mode == "crash-before":
                raise SystemExit("synthetic process death before provider ACK")
            if requested in self.members[subject]["roles"]:
                self.members[subject]["roles"].remove(requested)
            if self.after_delete:
                self.after_delete(subject, requested)
            if self.delete_mode == "unknown-absent":
                raise TimeoutError("synthetic provider applied but response was lost")
            if self.delete_mode == "crash-after":
                raise SystemExit("synthetic process death after provider effect")
            return None
        raise AssertionError("Unexpected request: " + method + " " + path)


class RoleResetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = pathlib.Path(self.temp.name) / "job.sqlite"
        self.api = FakeApi()
        self.job = reset.Job(self.path, create=True)
        self.addCleanup(self.job.close)

    def preview(self):
        return reset.preview(self.job, self.api, at=AT)

    def run_plan(self, plan, **kwargs):
        return reset.run(self.job, self.api, plan["plan_sha"], GUILD, reset.SCOPE, at=AT + 1, **kwargs)

    def refused(self, callback):
        """An explicit exception or a held summary is acceptable; success is not."""
        try:
            value = callback()
        except reset.ResetError:
            return
        self.assertIsInstance(value, dict)
        self.assertNotIn(value.get("state"), {"complete", "verified", "ready", "running", "settled"}, value)
        self.assertTrue(value.get("blocked") or value.get("error") or value.get("state") in
                        {"held", "blocked", "unknown", "failed", "incomplete", "verification_failed"}, value)

    def test_fixed_profile_is_exactly_the_approved_server_and_fourteen_roles(self):
        self.assertEqual(reset.GUILD_ID, GUILD)
        self.assertEqual(tuple(reset.ROLE_IDS), EXPECTED_ROLES)
        self.assertEqual(len(set(reset.ROLE_IDS)), 14)
        self.assertTrue(set(reset.ROLE_IDS).isdisjoint(rid for rid, _ in PROTECTED))

    def test_preview_is_read_only_and_keeps_protected_assignments(self):
        before = copy.deepcopy(self.api.members)
        plan = self.preview()
        self.assertRegex(plan["plan_sha"], r"^[0-9a-f]{64}$")
        self.assertEqual(self.api.deletes, [])
        self.assertEqual(self.api.members, before)

    def test_wrong_guild_scope_or_plan_never_dispatches(self):
        plan = self.preview()
        for digest, guild, scope in (("0" * 64, GUILD, reset.SCOPE),
                                     (plan["plan_sha"], "236932545793490944", reset.SCOPE),
                                     (plan["plan_sha"], GUILD, "all-server-roles")):
            with self.subTest(guild=guild, scope=scope):
                self.refused(lambda: reset.run(self.job, self.api, digest, guild, scope, at=AT + 1))
                self.assertEqual(self.api.deletes, [])

    def test_expired_preview_cannot_dispatch(self):
        plan = self.preview()
        self.refused(lambda: reset.run(self.job, self.api, plan["plan_sha"], GUILD, reset.SCOPE, at=AT + 1801))
        self.assertEqual(self.api.deletes, [])

    def test_expired_unspent_absent_pairs_can_reconcile_and_verify_without_deletes(self):
        self.preview()
        for item in self.api.members.values():
            item["roles"] = [rid for rid in item["roles"] if rid not in EXPECTED_ROLES]
        result = reset.reconcile(self.job, self.api, at=AT + 1801)
        self.assertEqual(result["counts"]["observed_absent"], 4)
        self.assertEqual(result["counts"]["pending"], 0)
        self.assertEqual(self.api.deletes, [])
        self.assertEqual(reset.verify(self.job, self.api, at=AT + 1802)["state"], "verified")

    def test_expired_unspent_present_pairs_stay_pending_after_read_only_reconciliation(self):
        self.preview()
        result = reset.reconcile(self.job, self.api, at=AT + 1801)
        self.assertEqual(result["counts"]["pending"], 4)
        self.assertEqual(result["counts"]["held"], 0)
        self.assertEqual(self.api.deletes, [])

    def test_run_is_bounded_and_only_deletes_one_selected_assignment(self):
        plan = self.preview()
        before_roles = copy.deepcopy(self.api.roles)
        self.run_plan(plan, max_removals=1)
        self.assertEqual(len(self.api.deletes), 1)
        self.assertEqual(self.api.roles, before_roles)
        self.assertIn(STAFF_ROLE, self.api.members[MEMBER]["roles"])
        self.assertIn(LINKED_ROLE, self.api.members[MEMBER]["roles"])
        self.assertIn(BOOSTER_ROLE, self.api.members[MEMBER_TWO]["roles"])
        self.assertTrue(all(method in {"GET", "DELETE"} for method, _ in self.api.calls))

    def test_fully_applied_plan_and_final_verification(self):
        plan = self.preview()
        self.run_plan(plan)
        self.assertEqual(len(self.api.deletes), 4)
        self.assertEqual(len(set(self.api.deletes)), 4)
        for item in self.api.members.values():
            self.assertTrue(set(item["roles"]).isdisjoint(EXPECTED_ROLES))
        result = reset.verify(self.job, self.api, at=AT + 2)
        self.assertEqual(result["state"], "verified")

    def test_unknown_present_is_get_only_reconciled_and_never_resent(self):
        plan = self.preview()
        self.api.delete_mode = "unknown-present"
        self.run_plan(plan)
        self.assertEqual(len(self.api.deletes), 1)
        self.api.delete_mode = None
        reset.reconcile(self.job, self.api, at=AT + 2)
        self.assertEqual(len(self.api.deletes), 1)
        self.refused(lambda: self.run_plan(plan))
        self.assertEqual(len(self.api.deletes), 1)

    def test_unknown_absent_is_get_only_reconciled_and_never_resent(self):
        plan = self.preview()
        self.api.delete_mode = "unknown-absent"
        self.run_plan(plan)
        first = self.api.deletes[0]
        self.api.delete_mode = None
        reset.reconcile(self.job, self.api, at=AT + 2)
        self.assertEqual(self.api.deletes, [first])
        self.run_plan(plan)
        self.assertEqual(self.api.deletes.count(first), 1)

    def test_process_death_leaves_a_spent_intent_that_resume_does_not_replay(self):
        plan = self.preview()
        self.api.delete_mode = "crash-after"
        with self.assertRaises(SystemExit):
            self.run_plan(plan)
        first = self.api.deletes[0]
        self.job.close()
        self.job = reset.Job(self.path)
        self.addCleanup(self.job.close)
        self.api.delete_mode = None
        reset.reconcile(self.job, self.api, at=AT + 2)
        self.run_plan(plan)
        self.assertEqual(self.api.deletes.count(first), 1)

    def test_process_death_before_effect_is_held_after_read_only_reconciliation(self):
        plan = self.preview()
        self.api.delete_mode = "crash-before"
        with self.assertRaises(SystemExit):
            self.run_plan(plan)
        first = self.api.deletes[0]
        self.job.close()
        self.job = reset.Job(self.path)
        self.addCleanup(self.job.close)
        self.api.delete_mode = None
        reset.reconcile(self.job, self.api, at=AT + 2)
        self.refused(lambda: self.run_plan(plan))
        self.assertEqual(self.api.deletes, [first])

    def test_lost_ack_database_write_cannot_replay_the_provider_effect(self):
        plan = self.preview()

        def lose_ack(subject, requested):
            # Durable claim already committed; now fail every attempted result
            # UPDATE. This models provider success followed by unavailable SQL.
            self.job.db.set_authorizer(lambda action, table, column, database, trigger:
                                       sqlite3.SQLITE_DENY if action == sqlite3.SQLITE_UPDATE and table == "operations"
                                       else sqlite3.SQLITE_OK)

        self.api.after_delete = lose_ack
        try:
            self.run_plan(plan)
        except (reset.ResetError, sqlite3.Error):
            pass
        finally:
            self.job.db.set_authorizer(None)
            self.api.after_delete = None
        self.assertEqual(len(self.api.deletes), 1)
        first = self.api.deletes[0]
        reset.reconcile(self.job, self.api, at=AT + 2)
        self.assertEqual(self.api.deletes, [first])
        self.run_plan(plan)
        self.assertEqual(self.api.deletes.count(first), 1)

    def test_role_above_bot_is_refused_before_any_removal(self):
        next(r for r in self.api.roles if r["id"] == EXPECTED_ROLES[1])["position"] = 50
        try:
            plan = self.preview()
        except reset.ResetError:
            plan = None
        if plan is not None:
            self.refused(lambda: self.run_plan(plan))
        self.assertEqual(self.api.deletes, [])

    def test_missing_manage_roles_permission_is_refused(self):
        next(r for r in self.api.roles if r["id"] == BOT_ROLE)["permissions"] = "0"
        try:
            plan = self.preview()
        except reset.ResetError:
            plan = None
        if plan is not None:
            self.refused(lambda: self.run_plan(plan))
        self.assertEqual(self.api.deletes, [])

    def test_malformed_member_inventory_cannot_create_a_usable_plan(self):
        transforms = (
            lambda page, after: page + page[:1],
            lambda page, after: list(reversed(page)),
            lambda page, after: [{"user": {"id": "not-a-snowflake"}, "roles": []}],
            lambda page, after: [{"user": {"id": MEMBER}, "roles": [EXPECTED_ROLES[0], EXPECTED_ROLES[0]]}],
            lambda page, after: {"members": page},
        )
        for index, transform in enumerate(transforms):
            with self.subTest(shape=index):
                self.api.list_transform = transform
                self.refused(self.preview)
                self.assertEqual(self.api.deletes, [])

    def test_new_selected_assignment_after_preview_is_outside_approved_pairs(self):
        plan = self.preview()
        new_role = EXPECTED_ROLES[8]
        self.api.members[MEMBER_THREE]["roles"].append(new_role)
        self.run_plan(plan)
        self.assertIn(new_role, self.api.members[MEMBER_THREE]["roles"])
        self.assertFalse(any(path.endswith("/roles/" + new_role) for path in self.api.deletes))
        self.refused(lambda: reset.verify(self.job, self.api, at=AT + 2))

    def test_regranted_settled_pair_is_not_deleted_again_by_same_plan(self):
        plan = self.preview()
        self.run_plan(plan, max_removals=1)
        first = self.api.deletes[0]
        path = first.strip("/").split("/")
        subject, requested = path[3], path[5]
        self.api.members[subject]["roles"].append(requested)
        self.run_plan(plan)
        self.assertEqual(self.api.deletes.count(first), 1)
        self.assertIn(requested, self.api.members[subject]["roles"])
        self.refused(lambda: reset.verify(self.job, self.api, at=AT + 2))

    def test_role_definition_drift_is_detected_without_role_edits(self):
        plan = self.preview()
        self.run_plan(plan)
        next(r for r in self.api.roles if r["id"] == EXPECTED_ROLES[0])["name"] = "Changed while operation ran"
        self.refused(lambda: reset.verify(self.job, self.api, at=AT + 2))
        self.assertTrue(all(method in {"GET", "DELETE"} for method, _ in self.api.calls))

    def test_role_definition_change_during_batch_stops_before_next_delete(self):
        plan = self.preview()
        self.api.after_delete = lambda subject, requested: next(
            item for item in self.api.roles if item["id"] == EXPECTED_ROLES[4]
        ).update(permissions="8")
        try:
            self.run_plan(plan)
        except reset.ResetError:
            pass
        self.assertEqual(len(self.api.deletes), 1, "A changed authority role must hold later dispatches")

    def test_plan_expiring_during_batch_stops_before_next_delete(self):
        plan = self.preview()
        current = {"now": AT + 1}
        self.api.after_delete = lambda subject, requested: current.update(now=AT + 1801)
        with mock.patch.object(reset, "clock", side_effect=lambda at=None: current["now"] if at is None else int(at)):
            try:
                reset.run(self.job, self.api, plan["plan_sha"], GUILD, reset.SCOPE)
            except reset.ResetError:
                pass
        self.assertEqual(len(self.api.deletes), 1, "An expired plan must not authorize a later dispatch")

    def test_protected_assignment_drift_is_detected_in_final_scan(self):
        plan = self.preview()
        self.run_plan(plan)
        self.api.members[MEMBER]["roles"].remove(STAFF_ROLE)
        self.refused(lambda: reset.verify(self.job, self.api, at=AT + 2))

    def test_concurrent_job_open_is_refused(self):
        with self.assertRaises(reset.ResetError):
            with reset.Job(self.path):
                self.fail("Concurrent runner acquired the same job")

    def test_full_inventory_is_paginated_and_final_verification_reads_every_page(self):
        for number in range(1050):
            subject = str(1900000000000000000 + number)
            self.api.members[subject] = member(subject)
        last = str(1900000000000001049)
        self.api.members[last]["roles"].append(EXPECTED_ROLES[9])
        plan = self.preview()
        first_scan = [path for method, path in self.api.calls if method == "GET" and "/members?" in path]
        self.assertGreaterEqual(len(first_scan), 2)
        self.assertTrue(any("after=" in path and not path.endswith("after=0") for path in first_scan))
        self.run_plan(plan)
        self.assertTrue(any("/members/" + last + "/roles/" in path for path in self.api.deletes))
        before = len(self.api.calls)
        self.assertEqual(reset.verify(self.job, self.api, at=AT + 2)["state"], "verified")
        second_scan = [path for method, path in self.api.calls[before:] if method == "GET" and "/members?" in path]
        self.assertGreaterEqual(len(second_scan), 2)

    def test_plan_keeps_ids_but_does_not_store_unneeded_profile_pii(self):
        self.preview()
        self.job.close()  # Release Windows' intentionally exclusive lock before reading every file.
        raw = b"".join(path.read_bytes() for path in pathlib.Path(self.temp.name).rglob("*") if path.is_file())
        self.assertNotIn(b"offline-test-010", raw)
        self.assertNotIn(b"offline-test-020", raw)
        self.assertNotIn(b"2026-10-01T00:00:00Z", raw)

    def test_redaction_cannot_destroy_a_nonterminal_job(self):
        self.preview()
        self.refused(lambda: reset.redact(self.job, at=AT + 1))

    def test_terminal_redaction_leaves_aggregate_only_receipt_without_member_ids(self):
        plan = self.preview()
        self.run_plan(plan)
        self.assertEqual(reset.verify(self.job, self.api, at=AT + 2)["state"], "verified")
        receipt = reset.redact(self.job)
        rendered = json.dumps(receipt, sort_keys=True)
        self.assertTrue(receipt)
        for subject in (MEMBER, MEMBER_TWO, MEMBER_THREE):
            self.assertNotIn(subject, rendered)
        self.job.close()
        raw = b"".join(path.read_bytes() for path in pathlib.Path(self.temp.name).rglob("*") if path.is_file())
        for subject in (MEMBER, MEMBER_TWO, MEMBER_THREE):
            self.assertNotIn(subject.encode(), raw)

    def test_unrelated_member_churn_does_not_fail_scoped_verification(self):
        outsider = "1800000000000000050"
        self.api.members[outsider] = member(outsider, [LINKED_ROLE])
        plan = self.preview()
        self.run_plan(plan)
        self.api.members[outsider]["roles"].append(BOOSTER_ROLE)
        self.assertEqual(reset.verify(self.job, self.api, at=AT + 2)["state"], "verified")
        self.assertTrue(reset.redact(self.job, at=AT + 3)["verification_succeeded"])

    def test_settled_redaction_keeps_failed_role_definition_check(self):
        plan = self.preview()
        self.run_plan(plan)
        self.api.roles[-1]["name"] = "Unrelated rename after dispatch"
        proof = reset.verify(self.job, self.api, at=AT + 2)["verification"]
        self.assertFalse(proof["same_role_definitions"])
        receipt = reset.redact(self.job, at=AT + 3)
        self.assertFalse(receipt["verification_succeeded"])
        self.assertFalse(receipt["role_definitions_preserved"])
        self.assertEqual(receipt["last_verification"], proof)
        self.assertIsNone(receipt["verified_at"])

    def test_settled_redaction_keeps_subject_membership_drift(self):
        plan = self.preview()
        self.run_plan(plan)
        self.api.members[MEMBER]["roles"].remove(LINKED_ROLE)
        reset.verify(self.job, self.api, at=AT + 2)
        receipt = reset.redact(self.job, at=AT + 3)
        self.assertFalse(receipt["other_memberships_unchanged_at_scan"])
        self.assertFalse(receipt["verification_succeeded"])

    def test_redaction_does_not_invent_zero_residual_or_success(self):
        plan = self.preview()
        self.run_plan(plan)
        self.api.members[MEMBER]["roles"].append(EXPECTED_ROLES[0])
        reset.verify(self.job, self.api, at=AT + 2)
        receipt = reset.redact(self.job, at=AT + 3)
        self.assertEqual(receipt["last_verification"]["remaining_assignments"], 1)
        self.assertEqual(receipt["role_counts"][EXPECTED_ROLES[0]], 1)
        self.assertFalse(receipt["verification_succeeded"])

    def test_no_scan_redaction_marks_verification_unknown(self):
        plan = self.preview()
        self.run_plan(plan)
        receipt = reset.redact(self.job, at=AT + 2)
        self.assertFalse(receipt["verification_succeeded"])
        for key in ("last_verification", "verified_at", "role_counts", "role_definitions_preserved", "other_memberships_unchanged_at_scan"):
            self.assertIsNone(receipt[key], key)

    def test_expired_partial_plan_redacts_only_unspent_pending_rows(self):
        plan = self.preview()
        self.run_plan(plan, max_removals=1)
        with self.assertRaises(reset.ResetError):
            reset.redact(self.job, at=AT + 2)
        receipt = reset.redact(self.job, at=AT + 1800)
        self.assertEqual(receipt["unprocessed_intents_abandoned"], 3)
        self.assertEqual(receipt["counts"]["confirmed_absent"], 1)
        self.assertFalse(receipt["operation_outcomes_settled"])
        self.assertFalse(receipt["verification_succeeded"])
        self.assertEqual(len(self.api.deletes), 1)

    def test_blocked_preview_persists_no_subject_ids_and_can_close(self):
        self.api.roles[1]["position"] = 999
        result = self.preview()
        self.assertEqual(result["state"], "blocked")
        self.assertEqual(sum(result["role_counts"].values()), 4)
        self.assertEqual(self.job.db.execute("SELECT COUNT(*) FROM operations").fetchone()[0], 0)
        self.assertEqual(self.job.get("plan")["pairs"], [])
        self.assertIsNone(self.job.get("plan")["protected_digest"])
        receipt = reset.redact(self.job, at=AT + 1)
        self.assertTrue(receipt["blocked_preview"])
        self.assertEqual(receipt["baseline_assignments"], 4)
        self.assertFalse(receipt["verification_succeeded"])
        self.job.close()
        raw = b"".join(p.read_bytes() for p in self.path.rglob("*") if p.is_file())
        for subject in (MEMBER, MEMBER_TWO, MEMBER_THREE):
            self.assertNotIn(subject.encode(), raw)

    def test_every_uncertain_state_refuses_redaction_even_after_expiry(self):
        self.preview()
        for state in ("dispatching", "acknowledged", "unknown", "held"):
            with self.subTest(state=state):
                self.job.db.execute("UPDATE operations SET state=?,attempts=1", (state,))
                with self.assertRaises(reset.ResetError):
                    reset.redact(self.job, at=AT + 1801)
                self.assertEqual(self.job.db.execute("SELECT COUNT(*) FROM operations").fetchone()[0], 4)

    def test_legacy_v1_digest_is_not_rewritten_and_can_redact_after_churn(self):
        self.preview()
        plan = self.job.get("plan")
        plan["version"] = 1
        plan.pop("protected_membership_scope")
        protected = [[subject, rid] for subject, obj in self.api.members.items()
                     for rid in obj["roles"] if rid not in EXPECTED_ROLES]
        plan["protected_digest"] = reset.digest(sorted(protected))
        self.job.set("plan", plan)
        self.job.set("plan_sha", reset.digest(plan))
        self.run_plan({"plan_sha": reset.digest(plan)})
        self.api.members[BOT]["roles"].append(LINKED_ROLE)
        result = reset.verify(self.job, self.api, at=AT + 2)
        self.assertEqual(result["state"], "verification_failed")
        self.assertEqual(self.job.get("plan"), plan)
        receipt = reset.redact(self.job, at=AT + 3)
        self.assertFalse(receipt["other_memberships_unchanged_at_scan"])

    def test_sensitive_authority_bits_and_repurposed_name_block(self):
        original = self.api.roles[1]["permissions"]
        for bit in (1, 2, 3, 4, 5, 7, 13, 22, 23, 24, 27, 28, 29, 30, 33, 34, 40):
            with self.subTest(bit=bit):
                self.api.roles[1]["permissions"] = str(1 << bit)
                self.assertIn({"role": EXPECTED_ROLES[0], "reason": "role_has_authority_permissions"}, reset.preflight(self.api)["blockers"])
        self.api.roles[1]["permissions"] = original
        self.api.roles[1]["name"] = "Council Officer"
        self.assertIn({"role": EXPECTED_ROLES[0], "reason": "role_name_differs_from_approved_label"}, reset.preflight(self.api)["blockers"])
        self.api.roles[1]["managed"] = True
        self.assertIn({"role": EXPECTED_ROLES[0], "reason": "managed_or_unknown_role"}, reset.preflight(self.api)["blockers"])

    def test_missing_role_and_inventory_bounds_fail_closed(self):
        with mock.patch.object(reset, "MAX_MEMBERS", 1), self.assertRaises(reset.ResetError):
            self.preview()
        with mock.patch.object(reset, "MAX_PAIRS", 1), self.assertRaises(reset.ResetError):
            self.preview()
        self.api.roles.pop(1)
        with self.assertRaises(reset.ResetError):
            self.preview()
        self.assertEqual(self.api.deletes, [])

    def test_member_role_bound_and_invalid_slice_limits(self):
        with self.assertRaises(reset.ResetError):
            reset.roles_of(member(MEMBER, [str(1900000000000000000 + i) for i in range(251)]))
        plan = self.preview()
        for limit in (0, 101, True):
            with self.subTest(limit=limit), self.assertRaises(reset.ResetError):
                self.run_plan(plan, max_removals=limit)
        self.assertEqual(self.api.deletes, [])

    def test_plan_and_operation_tampering_cannot_dispatch(self):
        self.preview()
        plan = self.job.get("plan")
        plan["pairs"] = plan["pairs"][:-1]
        self.job.set("plan", plan)
        with self.assertRaises(reset.ResetError):
            reset.load_plan(self.job)
        self.job.set("plan_sha", reset.digest(plan))
        with self.assertRaises(reset.ResetError):
            reset.load_plan(self.job)
        self.job.db.execute("DELETE FROM operations WHERE subject=? AND role=?", (MEMBER_THREE, EXPECTED_ROLES[13]))
        self.job.db.execute("UPDATE operations SET attempts=1 WHERE state='pending'")
        with self.assertRaises(reset.ResetError):
            reset.load_plan(self.job)
        self.assertEqual(self.api.deletes, [])

    def test_only_unknown_member_code_can_settle_an_absence(self):
        for code in (None, 10004, 50001, 10007):
            with self.subTest(code=code), mock.patch.object(self.api, "request", side_effect=reset.APIError(404, code=code)):
                if code == 10007:
                    self.assertIsNone(reset.current_member(self.api, MEMBER))
                else:
                    with self.assertRaises(reset.APIError):
                        reset.current_member(self.api, MEMBER)

    def test_provider_delete_failures_remain_spent_and_get_only(self):
        for code in (403, 404, 429, 503):
            with self.subTest(status=code), reset.Job(self.path.parent / f"http-{code}", create=True) as job:
                api = FakeApi()
                plan = reset.preview(job, api, at=AT)
                original = api.request

                def fail_delete(method, path):
                    if method == "DELETE":
                        api.calls.append((method, path))
                        raise reset.APIError(code)
                    return original(method, path)

                with mock.patch.object(api, "request", side_effect=fail_delete):
                    result = reset.run(job, api, plan["plan_sha"], GUILD, reset.SCOPE, at=AT + 1)
                self.assertEqual(result["counts"]["unknown"], 1)
                reset.reconcile(job, api, at=AT + 2)
                self.assertEqual(reset.status(job, AT + 2)["counts"]["held"], 1)
                with self.assertRaises(reset.ResetError):
                    reset.run(job, api, plan["plan_sha"], GUILD, reset.SCOPE, at=AT + 1)
                self.assertEqual(len(api.deletes), 1)


class TransportTests(unittest.TestCase):
    class Response:
        def __init__(self, status=200, value=None):
            self.status = status
            self.headers = {}
            self.value = b"" if value is None else json.dumps(value).encode()

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return None

        def read(self, bound=-1):
            return self.value[:bound] if bound >= 0 else self.value

    def setUp(self):
        self.api = reset.DiscordApi("synthetic-offline-bot-token")
        self.api.opener = mock.Mock()

    def test_request_rejects_wrong_server_and_protected_role_before_transport(self):
        paths = (
            ("GET", "/guilds/236932545793490944/roles"),
            ("DELETE", f"/guilds/{GUILD}/members/{MEMBER}/roles/{STAFF_ROLE}"),
            ("PATCH", f"/guilds/{GUILD}/members/{MEMBER}"),
            ("DELETE", f"/guilds/{GUILD}/members/{MEMBER}"),
            ("GET", "https://attacker.invalid/steal"),
        )
        for method, path in paths:
            with self.subTest(method=method, path=path), self.assertRaises(reset.ResetError):
                self.api.request(method, path)
        self.api.opener.open.assert_not_called()

    def test_delete_429_is_not_automatically_retried(self):
        error = urllib.error.HTTPError("https://discord.com/api/v10/test", 429, "rate limited",
                                       {"Retry-After": "1"}, io.BytesIO(b'{"retry_after":1}'))
        self.api.opener.open.side_effect = error
        with self.assertRaises(reset.APIError) as raised:
            self.api.request("DELETE", f"/guilds/{GUILD}/members/{MEMBER}/roles/{EXPECTED_ROLES[0]}")
        self.assertEqual(raised.exception.status, 429)
        self.assertEqual(self.api.opener.open.call_count, 1)

    def test_delete_transport_timeout_is_not_automatically_retried(self):
        self.api.opener.open.side_effect = urllib.error.URLError("synthetic timeout")
        with self.assertRaises(reset.ResetError):
            self.api.request("DELETE", f"/guilds/{GUILD}/members/{MEMBER}/roles/{EXPECTED_ROLES[0]}")
        self.assertEqual(self.api.opener.open.call_count, 1)

    def test_only_204_is_accepted_as_delete_acknowledgment(self):
        self.api.opener.open.return_value = self.Response(status=200, value={"ok": True})
        with self.assertRaises(reset.APIError):
            self.api.request("DELETE", f"/guilds/{GUILD}/members/{MEMBER}/roles/{EXPECTED_ROLES[0]}")
        self.assertEqual(self.api.opener.open.call_count, 1)

    def test_read_only_429_may_retry_once_after_cooldown(self):
        error = urllib.error.HTTPError("https://discord.com/api/v10/test", 429, "rate limited",
                                       {"Retry-After": "1"}, io.BytesIO(b'{"retry_after":1}'))
        self.api.opener.open.side_effect = [error, self.Response(value={"id": BOT, "bot": True})]
        with mock.patch.object(reset.time, "sleep") as sleep:
            self.assertEqual(self.api.request("GET", "/users/@me")["id"], BOT)
        self.assertEqual(self.api.opener.open.call_count, 2)
        sleep.assert_called_once()

    def test_transport_uses_bot_header_fixed_origin_and_audit_reason(self):
        self.api.opener.open.return_value = self.Response(status=204)
        self.api.request("DELETE", f"/guilds/{GUILD}/members/{MEMBER}/roles/{EXPECTED_ROLES[0]}")
        request = self.api.opener.open.call_args.args[0]
        self.assertEqual(request.full_url, f"https://discord.com/api/v10/guilds/{GUILD}/members/{MEMBER}/roles/{EXPECTED_ROLES[0]}")
        self.assertEqual(request.get_header("Authorization"), "Bot synthetic-offline-bot-token")
        self.assertIn("Stockades", request.get_header("X-audit-log-reason"))

    def test_plan_expiry_after_provider_cooldown_blocks_transport_before_delete(self):
        current = {"now": AT + 1799}
        self.api.write_deadline = AT + 1800
        self.api.not_before = 105.0
        with mock.patch.object(reset.time, "monotonic", return_value=100.0), \
                mock.patch.object(reset.time, "sleep", side_effect=lambda delay: current.update(now=current["now"] + int(delay))) as sleep, \
                mock.patch.object(reset, "clock", side_effect=lambda at=None: current["now"]):
            with self.assertRaises(reset.ResetError):
                self.api.request("DELETE", f"/guilds/{GUILD}/members/{MEMBER}/roles/{EXPECTED_ROLES[0]}")
        sleep.assert_called_once_with(5.0)
        self.api.opener.open.assert_not_called()

    def test_429_body_and_header_are_independent_and_never_shortened(self):
        for body, header, expected in ((b"<html>limited</html>", "3000", 3000),
                                       (b'{"retry_after":7200}', None, 7200),
                                       (b'{"retry_after":1}', "90", 90),
                                       (b'{"retry_after":NaN}', "1", float("inf")),
                                       (b"not json", None, float("inf"))):
            with self.subTest(body=body):
                self.api.not_before = 0
                headers = {} if header is None else {"Retry-After": header}
                self.api.opener.open.reset_mock()
                self.api.opener.open.side_effect = urllib.error.HTTPError("https://discord.com/api/v10/test", 429, "limited", headers, io.BytesIO(body))
                with mock.patch.object(reset.time, "monotonic", return_value=100), mock.patch.object(reset.time, "sleep") as sleep:
                    with self.assertRaises(reset.APIError) as caught:
                        self.api.request("GET", "/users/@me")
                self.assertEqual(caught.exception.retry_after, expected)
                self.assertEqual(self.api.not_before, 100 + expected)
                self.api.opener.open.assert_called_once()
                sleep.assert_not_called()

    def test_success_header_cooldown_is_honored_and_unknown_delay_stops(self):
        response = self.Response(value={"id": BOT, "bot": True})
        response.headers = {"X-RateLimit-Remaining": "0", "X-RateLimit-Reset-After": "2.5"}
        self.api.opener.open.side_effect = [response, self.Response(value={"id": BOT})]
        with mock.patch.object(reset.time, "monotonic", return_value=100), mock.patch.object(reset.time, "sleep") as sleep:
            self.api.request("GET", "/users/@me")
            self.api.request("GET", "/users/@me")
        sleep.assert_called_once_with(2.5)
        self.api.not_before = float("inf")
        self.api.opener.open.reset_mock()
        with self.assertRaises(reset.ResetError):
            self.api.request("GET", "/users/@me")
        self.api.opener.open.assert_not_called()

    def test_transport_errors_and_oversized_body_are_bounded(self):
        for error in (http.client.BadStatusLine("untrusted body"), http.client.IncompleteRead(b"private"), OSError("private")):
            with self.subTest(error=type(error).__name__):
                self.api.opener.open.side_effect = error
                with self.assertRaisesRegex(reset.ResetError, "Discord transport or response outcome is unknown"):
                    self.api.request("GET", "/users/@me")
        self.api.opener.open.side_effect = None
        self.api.opener.open.return_value = self.Response(value={"long": "x" * 100})
        with mock.patch.object(reset, "MAX_RESPONSE", 10), self.assertRaisesRegex(reset.ResetError, "bounded reader"):
            self.api.request("GET", "/users/@me")

    def test_bounded_error_code_and_discordbot_user_agent(self):
        self.api.opener.open.side_effect = urllib.error.HTTPError("https://discord.com/api/v10/test", 404, "missing", {},
                                                                io.BytesIO(b'{"code":10007,"message":"private"}'))
        with self.assertRaises(reset.APIError) as caught:
            self.api.request("GET", f"/guilds/{GUILD}/members/{MEMBER}")
        self.assertEqual(caught.exception.code, 10007)
        self.assertNotIn("private", str(caught.exception))
        request = self.api.opener.open.call_args.args[0]
        self.assertTrue(request.get_header("User-agent").startswith("DiscordBot (https://olympus.roachcouncil.com, "))


class RealTransportJobTests(unittest.TestCase):
    setUp = RoleResetTests.setUp
    preview = RoleResetTests.preview

    def make_transport(self):
        transport = reset.DiscordApi("synthetic-offline-bot-token")

        def opened(req, timeout):
            method = req.get_method()
            path = req.full_url.removeprefix("https://discord.com/api/v10")
            value = self.api.request(method, path)
            return TransportTests.Response(status=204 if method == "DELETE" else 200, value=value)

        transport.opener = mock.Mock()
        transport.opener.open.side_effect = opened
        return transport

    def test_long_cooldown_before_claim_records_no_unknown_or_attempt(self):
        plan = self.preview()
        transport = self.make_transport()
        with mock.patch.object(transport, "await_write_slot", side_effect=reset.NotDispatched("not_sent_cooldown")):
            with self.assertRaises(reset.NotDispatched):
                reset.run(self.job, transport, plan["plan_sha"], GUILD, reset.SCOPE, at=AT + 1)
        self.assertEqual(self.api.deletes, [])
        rows = self.job.db.execute("SELECT state,attempts FROM operations").fetchall()
        self.assertTrue(all(tuple(row) == ("pending", 0) for row in rows))
        self.assertEqual(self.job.db.execute("SELECT COUNT(*) FROM events WHERE kind='dispatching'").fetchone()[0], 0)

    def test_expiry_backstop_after_claim_is_proven_not_sent(self):
        plan = self.preview()
        transport = self.make_transport()
        original = transport._await_slot
        delete_checks = []

        def slots(method, deadline=None):
            if method == "DELETE":
                delete_checks.append(method)
                if len(delete_checks) == 2:
                    raise reset.NotDispatched("not_sent_expired")
                return
            return original(method, deadline)

        with mock.patch.object(transport, "_await_slot", side_effect=slots):
            with self.assertRaises(reset.NotDispatched):
                reset.run(self.job, transport, plan["plan_sha"], GUILD, reset.SCOPE, at=AT + 1)
        self.assertEqual(len(delete_checks), 2)
        self.assertEqual(self.api.deletes, [])
        self.assertTrue(all(tuple(r) == ("pending", 0) for r in self.job.db.execute("SELECT state,attempts FROM operations")))
        details = [r[0] for r in self.job.db.execute("SELECT detail FROM events WHERE kind='not_dispatched'")]
        self.assertEqual(details, ["not_sent_expired"])


class CliAndPrivacyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = pathlib.Path(self.temp.name) / "fresh-job"
        self.token = "synthetic-cli-token-ONLY"

    def cli(self, command, *extra, token=None, tty=True, opener=None, at=AT):
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.dict(reset.os.environ, {"OLYMPUS_ROLE_RESET_BOT_TOKEN": self.token if token is None else token}), \
                mock.patch.object(reset.sys.stdin, "isatty", return_value=tty), \
                mock.patch.object(reset, "clock", side_effect=lambda value=None: at if value is None else int(value)), \
                mock.patch.object(reset.urllib.request, "build_opener", return_value=opener), \
                contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = reset.main([command, "--job", str(self.path), *extra])
        self.assertNotIn(self.token, out.getvalue() + err.getvalue())
        return code, out.getvalue(), err.getvalue()

    def test_missing_whitespace_tokens_and_prompt_non_tty_do_not_create_jobs(self):
        for value in ("", " ", "bad token"):
            with self.subTest(token_kind=len(value)):
                self.assertEqual(self.cli("preview", token=value)[0], 2)
                self.assertFalse(self.path.exists())
        self.assertEqual(self.cli("preview", "--prompt-token", tty=False)[0], 2)
        self.assertFalse(self.path.exists())

    def test_environment_token_run_requires_terminal_before_job_access(self):
        code, _, err = self.cli("run", "--confirm-plan", "0" * 64, "--confirm-guild", GUILD,
                                "--confirm-scope", reset.SCOPE, tty=False)
        self.assertEqual(code, 2)
        self.assertIn("attended interactive terminal", err)
        self.assertFalse(self.path.exists())

    def test_real_transport_cli_commands_never_store_or_print_token(self):
        fake, opener = FakeApi(), mock.Mock()

        def opened(req, timeout):
            self.assertEqual(req.get_header("Authorization"), "Bot " + self.token)
            method = req.get_method()
            value = fake.request(method, req.full_url.removeprefix("https://discord.com/api/v10"))
            return TransportTests.Response(status=204 if method == "DELETE" else 200, value=value)

        opener.open.side_effect = opened
        code, out, _ = self.cli("preview", opener=opener)
        self.assertEqual(code, 0)
        plan = json.loads(out)
        self.assertEqual(self.cli("run", "--confirm-plan", plan["plan_sha"], "--confirm-guild", GUILD,
                                  "--confirm-scope", reset.SCOPE, opener=opener)[0], 0)
        for command in ("status", "reconcile", "verify", "redact", "status"):
            self.assertEqual(self.cli(command, opener=opener)[0], 0, command)
        raw = b"".join(p.read_bytes() for p in self.path.rglob("*") if p.is_file())
        self.assertNotIn(self.token.encode(), raw)
        for subject in (MEMBER, MEMBER_TWO, MEMBER_THREE):
            self.assertNotIn(subject.encode(), raw)

    def test_cli_transport_and_subprocess_failures_use_bounded_diagnostics(self):
        opener = mock.Mock()
        opener.open.side_effect = http.client.BadStatusLine(self.token)
        code, _, err = self.cli("preview", opener=opener)
        self.assertEqual(code, 2)
        self.assertNotIn("Traceback", err)
        with mock.patch.object(reset, "Job", side_effect=reset.subprocess.CalledProcessError(1, self.token)):
            code, _, err = self.cli("preview", opener=opener)
        self.assertEqual(code, 2)
        self.assertNotIn("Traceback", err)

    def test_existing_path_is_not_overwritten_and_has_specific_message(self):
        self.path.mkdir()
        marker = self.path / "retained.txt"
        marker.write_text("retained")
        code, _, err = self.cli("preview", opener=mock.Mock())
        self.assertEqual(code, 2)
        self.assertIn("Job path already exists", err)
        self.assertEqual(marker.read_text(), "retained")

    def test_expired_pending_status_has_explicit_flag_and_nonzero_exit(self):
        with reset.Job(self.path, create=True) as job:
            reset.preview(job, FakeApi(), at=AT)
        code, out, _ = self.cli("status", at=AT + 1800)
        self.assertEqual(code, 2)
        self.assertTrue(json.loads(out)["expired"])
        self.assertEqual(json.loads(out)["counts"]["pending"], 4)

    def test_windows_acl_children_use_absolute_tools_and_no_bot_token(self):
        system = pathlib.Path("C:/Windows/System32") if reset.os.name == "nt" else pathlib.Path("/system32")
        completed = mock.Mock(stdout='"operator","S-1-5-21-1-2-3-1001"', returncode=0)
        with mock.patch.object(reset.os, "name", "nt"), \
                mock.patch.object(reset.subprocess, "CREATE_NO_WINDOW", 0x08000000, create=True), \
                mock.patch.object(reset, "windows_system_tool", side_effect=lambda name: str(system / name)), \
                mock.patch.dict(reset.os.environ, {"OLYMPUS_ROLE_RESET_BOT_TOKEN": self.token}), \
                mock.patch.object(reset.subprocess, "run", return_value=completed) as child:
            reset.private_directory(self.path)
        self.assertEqual(child.call_count, 2)
        self.assertEqual(child.call_args_list[0].args[0][0], str(system / "whoami.exe"))
        self.assertEqual(child.call_args_list[1].args[0][0], str(system / "icacls.exe"))
        for call in child.call_args_list:
            self.assertNotIn("OLYMPUS_ROLE_RESET_BOT_TOKEN", call.kwargs["env"])
            self.assertNotIn(self.token, repr(call.args))

    def test_posix_private_modes_and_symlink_refusals(self):
        if reset.os.name == "nt":
            self.skipTest("POSIX modes/symlinks; Windows lock and ACL child paths exercised by this local suite")
        with reset.Job(self.path, create=True):
            self.assertEqual(self.path.stat().st_mode & 0o777, 0o700)
            for name in ("job.sqlite3", "operator.lock"):
                self.assertEqual((self.path / name).stat().st_mode & 0o777, 0o600)
        self.path.chmod(0o750)
        with self.assertRaises(reset.ResetError):
            reset.Job(self.path)
        self.path.chmod(0o700)
        link = pathlib.Path(self.temp.name) / "link"
        link.symlink_to(self.path, target_is_directory=True)
        with self.assertRaises(reset.ResetError):
            reset.Job(link)
        for name in ("job.sqlite3", "operator.lock"):
            target = self.path / name
            target.unlink()
            target.symlink_to(pathlib.Path(self.temp.name) / "elsewhere")
            with self.assertRaises(reset.ResetError):
                reset.Job(self.path)
            target.unlink()


if __name__ == "__main__":
    unittest.main(verbosity=2)

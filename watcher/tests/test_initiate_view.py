"""Read the actual two generated Lua formats through the officer view's poller."""
import copy
from pathlib import Path
import tempfile
import unittest

import test_directive_rank_transition as fixtures
import initiate_view as view
import launch_operations229 as launch
from watcher import Watcher, STRICT_DISPLAY_PROTOCOL


class InitiateViewTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.directory = Path(tmp.name)
        self.files = view.Files(self.directory)
        f = fixtures.DirectiveTransition()
        f.setUp()
        self.at = f.at
        self.display = dict(protocol=STRICT_DISPLAY_PROTOCOL, guild="OLYMPUS PRIME", realm="Native Realm",
                            fetchedAt=f.at, snapshotAt=f.at-1, verified=[], unverified=[], unknown=[])
        self.records = []
        for start, count in ((0, 20), (20, 2)):
            targets = [f"Player-1-{i:08X}" for i in range(start, start+count)]
            page = f.page()
            page.update(memberCount=25)
            page["entitlements"].update(scanned=count, total=25, unscanned=25-count)
            template = page["promotions"].pop()
            for i, guid in enumerate(targets, start=start):
                name = "Ñò Life" if i == 20 else f"Character {i:02d}"
                self.display["verified"].append(dict(name=name, guid=guid, username=f"handle_{i}",
                                                    displayName="Not a public field of this window", status="member"))
                row = copy.deepcopy(template)
                row.update(name=name, guid=guid)
                row["intent"].update(targetGuid=guid, name=name)
                page["promotions"].append(row)
            self.records.append(dict(version=2, protocol=launch.DIRECTIVE_PROTOCOL, controlId=f"{f.at}:{start+1}",
                            actorGuid=f.actor, confirmations="[]", scopeHash=f.scope, observedAt=f.at, startedAt=f.at,
                            targetGuids=targets, targetsDigest=launch.targets_digest276(targets), coverageKind="selected-guids",
                            snapshotId=12, snapshotAt=f.at-1, expiresAt=f.at+599, running=False, completed=True,
                            stoppedReason=None, attempts=1, page=page, coveredGuids=list(targets)))
        self.write()

    def write(self):
        display = Watcher.render_strict_display(self.display, self.display["fetchedAt"])
        checks = launch.render_sweep(self.records, self.at)
        self.assertIsInstance(checks, str)
        self.assertIsInstance(display, str)
        (self.directory / (view.DISPLAY + ".lua")).write_text(display, encoding="utf-8")
        (self.directory / (view.CHECKS + ".lua")).write_text(checks, encoding="utf-8")

    def test_all_pages_search_and_monotonic_expiration_without_rewrite(self):
        data = self.files.get(self.at)
        self.assertEqual((data.targets, data.completed, data.groups), (22, 2, 2))
        self.assertEqual(len(data.rows), 22)
        self.assertTrue(all(row.state == view.REVIEW and row.target == "Member" for row in data.rows))
        self.assertEqual(view.filtered(data.rows, "ÑÒ", "All"), view.filtered(data.rows, "@handle_20", view.REVIEW))
        self.assertEqual(len(view.filtered(data.rows, "Ñò", view.REVIEW)), 1)
        self.assertNotIn("Not a public field", repr(data))
        self.assertNotIn("synthetic-intent", repr(data))
        expired = self.files.get(self.at+500)
        self.assertTrue(all(row.state == view.STALE and not row.target for row in expired.rows))
        self.assertIn("expired", self.files.get(self.at+599).message)

    def test_checking_held_then_completed_files_change_with_wow_open(self):
        final = copy.deepcopy(self.records)
        for rec, running in zip(self.records, (True, False)):
            rec.update(completed=False, running=running, attempts=0, page=None, coveredGuids=[],
                       stoppedReason=None if running else "source-unknown")
        self.write()
        initial = self.files.get(self.at)
        self.assertEqual(len(view.filtered(initial.rows, "", view.CHECKING)), 20)
        self.assertEqual(len(view.filtered(initial.rows, "", view.HELD)), 2)
        self.records = final
        p = self.records[0]["page"]
        old = p["promotions"].pop()
        p["held"].append(dict(guid=old["guid"], name=old["name"], reason="pending-verification"))
        self.display["fetchedAt"] += 1
        self.write()
        newer = self.files.get(self.at+1)
        self.assertEqual(len(view.filtered(newer.rows, "", view.WAITING)), 1)
        self.assertEqual(len(view.filtered(newer.rows, "", view.REVIEW)), 21)

    def test_newer_roster_clock_applies_separately_to_each_group(self):
        self.display["snapshotAt"] = self.at
        rec = self.records[-1]
        rec.update(snapshotAt=self.at, snapshotId=13, expiresAt=self.at+600)
        page = rec["page"]
        page.update(snapshotAt=self.at, snapshotId=13)
        page["scan"].update(expiresAt=rec["expiresAt"])
        for row in page["promotions"]:
            row["intent"].update(originSnapshotId=13, lastSnapshotId=13, originSnapshotAt=self.at, lastObservedAt=self.at)
        self.write()
        rows = self.files.get(self.at).rows
        self.assertEqual(len(view.filtered(rows, "", view.STALE)), 20)
        self.assertEqual(len(view.filtered(rows, "", view.REVIEW)), 2)

    def test_held_rank_change_is_excluded_but_unavailable_role_stays_held(self):
        page = self.records[0]["page"]
        for reason in ("selected-rank-changed", "discord-entitlement-unknown"):
            row = page["promotions"].pop()
            page["held"].append(dict(guid=row["guid"], name=row["name"], reason=reason))
        self.write()
        data = self.files.get(self.at)
        self.assertEqual(len(data.rows), 21)
        self.assertEqual(len(view.filtered(data.rows, "", view.REVIEW)), 20)
        self.assertEqual(len(view.filtered(data.rows, "", view.HELD)), 1)

    def test_explicit_intent_and_actor_required_even_for_a_verified_name(self):
        path = self.directory / (view.CHECKS + ".lua")
        original = path.read_text(encoding="utf-8")
        # A malformed local file must not display any positive recommendations.
        for changed in (original.replace("acknowledgedSteps=0", "acknowledgedSteps=1", 1),
                        original.replace("requiresNativeRecheck=true", "requiresNativeRecheck=1", 1),
                        original.replace("actorGuid=\"Player-1-0000AAAA\"", "actorGuid=\"Player-1-0000AAAB\"", 1)):
            self.assertNotEqual(changed, original)
            path.write_text(changed, encoding="utf-8")
            self.assertFalse(view.filtered(self.files.get(self.at).rows, "", view.REVIEW))

    def test_scope_guid_removal_or_partial_write_cannot_supply_readiness(self):
        dropped = self.display["verified"].pop()
        self.display["unverified"].append(dict(name=dropped["name"], guid=dropped["guid"], pending=True))
        self.write()
        self.assertEqual(len(self.files.get(self.at).rows), 21)
        self.display["realm"] = "Different Realm"
        self.write()
        self.assertFalse(self.files.get(self.at).rows)
        (self.directory / (view.CHECKS + ".lua")).write_text("OlympusInitiateChecks={", encoding="utf-8")
        self.assertFalse(self.files.get(self.at).rows)

    def test_zero_native_receipt_requires_matching_fresh_roster(self):
        receipt = dict(scopeHash=self.records[0]["scopeHash"], snapshotId=12, snapshotAt=self.at-1)
        path = self.directory / (view.CHECKS + ".lua")
        def write_receipt():
            path.write_text(launch.render_sweep([], self.at, receipt), encoding="utf-8")
        write_receipt()
        self.assertIn("No native Initiates", self.files.get(self.at).message)
        self.assertFalse(self.files.get(self.at).rows)
        self.assertIn("stale", self.files.get(self.at+600).message)
        receipt["snapshotAt"] -= 1
        write_receipt()
        self.assertIn("stale", self.files.get(self.at).message)
        receipt.update(snapshotAt=self.at-1, scopeHash="0"*16)
        write_receipt()
        self.assertIn("stale", self.files.get(self.at).message)
        path.write_text("OlympusInitiateChecks={version=1,records={}}", encoding="utf-8")
        self.assertIn("Waiting", self.files.get(self.at).message)

    def test_window_search_and_filters(self):
        try:
            import tkinter as tk
        except ImportError:
            self.skipTest("Tk is unavailable")
        try:
            root = tk.Tk()
        except tk.TclError:
            self.skipTest("Tk requires a graphical display")
        root.withdraw()
        self.addCleanup(root.destroy)
        tree, query, state = view.show(root, self.directory, lambda: self.at)
        self.assertEqual(len(tree.get_children()), 22)
        query.set("@handle_20")
        self.assertEqual(len(tree.get_children()), 1)
        self.assertEqual(tree.item(tree.get_children()[0], "values")[:2], ("Ñò Life", "@handle_20"))
        state.set(view.STALE)
        self.assertFalse(tree.get_children())

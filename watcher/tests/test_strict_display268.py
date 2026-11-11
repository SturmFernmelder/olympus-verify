"""Focused safe-display rendering. No Watcher instance/config/network is used."""
from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import savedvars
import watcher


class StrictDisplayV2Tests(unittest.TestCase):
    at = 1_800_000_000

    def report(self):
        return {
            "protocol": "launch-roster-display-v2", "fetchedAt": self.at,
            "snapshotAt": self.at - 60, "guild": "Olympus", "realm": "Fixture Realm",
            "verified": [{"name": "Fresh Member", "guid": "Player-4613-00000001",
                          "status": "member", "username": None, "displayName": None}],
            "unverified": [{"name": "Pending Member", "guid": "Player-4613-00000002", "pending": True}],
            "unknown": [{"name": "Older Member", "guid": "Player-4613-00000003", "reason": "linked_before_cutoff"},
                        {"name": "Review Member", "guid": "Player-4613-00000004", "reason": "link_review"}],
        }

    def render(self, report):
        return watcher.Watcher.render_strict_display(report, self.at)

    def test_v2_round_trip_keeps_unknown_separate_and_private(self):
        report = self.report()
        original = copy.deepcopy(report)
        text = self.render(report)
        self.assertIsInstance(text, str)
        result = savedvars.parse(text)["OlympusVerifyLists"]
        self.assertEqual(result["version"], 2)
        self.assertEqual(result["unknown"]["members"], report["unknown"])
        self.assertEqual(result["unknown"]["fetchedAt"], self.at)
        self.assertEqual(result["unknown"]["snapshotAt"], self.at - 60)
        self.assertEqual(len(result["verified"]["members"]), 1)
        self.assertEqual(report, original)
        for row in result["unknown"]["members"]:
            self.assertEqual(set(row), {"name", "guid", "reason"})

    def test_explicit_v1_retains_original_shape(self):
        report = self.report()
        report["protocol"] = "launch-roster-display-v1"
        del report["unknown"]
        result = savedvars.parse(self.render(report))["OlympusVerifyLists"]
        self.assertEqual(result["version"], 1)
        self.assertEqual(set(result), {"version", "guild", "realm", "verified", "unverified"})

    def test_v2_requires_exact_eight_keys_and_explicit_protocol(self):
        base = self.report()
        cases = []
        missing = copy.deepcopy(base)
        del missing["unknown"]
        cases.append(missing)
        for key, value in (("discordId", "synthetic-private"), ("details", "not-public")):
            changed = copy.deepcopy(base)
            changed[key] = value
            cases.append(changed)
        for protocol in (None, "", "launch-roster-display-v3"):
            changed = copy.deepcopy(base)
            changed["protocol"] = protocol
            cases.append(changed)
        for report in cases:
            with self.subTest(report_keys=sorted(report), protocol=report.get("protocol")):
                self.assertIsNone(self.render(report))

    def test_unknown_rows_reject_private_details_or_unapproved_reasons(self):
        for key, value in (("discordId", "synthetic-private"), ("username", "private"),
                           ("denied", True), ("status", "member")):
            report = self.report()
            report["unknown"][0][key] = value
            with self.subTest(extra_field=key):
                self.assertIsNone(self.render(report))
        for reason in (None, True, "verified", "privacy_retired", "banned", "", {}):
            report = self.report()
            report["unknown"][0]["reason"] = reason
            with self.subTest(reason=reason):
                self.assertIsNone(self.render(report))

    def test_all_sections_share_guid_uniqueness(self):
        for section in ("verified", "unverified", "unknown"):
            report = self.report()
            report["unknown"][0]["guid"] = report[section][-1]["guid"]
            with self.subTest(section=section):
                self.assertIsNone(self.render(report))

    def test_unknown_native_identity_and_shape_are_validated(self):
        for key, value in (("name", ""), ("name", "bad|name"), ("name", "bad\nname"),
                           ("guid", "not-a-guid"), ("guid", None)):
            report = self.report()
            report["unknown"][0][key] = value
            with self.subTest(key=key, value=value):
                self.assertIsNone(self.render(report))
        for rows in (None, {}, "unknown"):
            report = self.report()
            report["unknown"] = rows
            self.assertIsNone(self.render(report))

    def test_combined_bound_accepts_1000_and_refuses_1001(self):
        report = self.report()
        report["verified"] = []
        report["unverified"] = []
        report["unknown"] = [{"name": f"Review Member {n}", "guid": f"Player-4613-{n:08X}",
                              "reason": "link_review"} for n in range(1000)]
        self.assertIsInstance(self.render(report), str)
        report["verified"] = [{"name": "Additional Member", "guid": "Player-4613-FFFFFFFF",
                               "status": "member", "username": None, "displayName": None}]
        self.assertIsNone(self.render(report))

    def test_unknown_does_not_relax_existing_freshness_clock_guards(self):
        for key, value in (("snapshotAt", self.at - 3601), ("snapshotAt", self.at + 1),
                           ("fetchedAt", self.at - 61), ("fetchedAt", True), ("snapshotAt", "1800000000")):
            report = self.report()
            report[key] = value
            with self.subTest(key=key, value=value):
                self.assertIsNone(self.render(report))


if __name__ == "__main__":
    unittest.main()

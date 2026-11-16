import copy
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "late_inventory", Path(__file__).resolve().parents[2] / "tools" / "prepare-late-verification285.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class LateInventoryTests(unittest.TestCase):
    def row(self, **changes):
        body = {"type": "verify", "character": "Synthetic Member", "source": "whisper",
                "guid": "Player-4613-12345678", "code": "ABC1234",
                "nativeMembership": {"version": 1, "member": False, "observedAt": 1794830000,
                                     "scopeHash": "a" * 16, "mac": "b" * 32},
                "observedAt": 1, "financialDataMustNotLeave": "private"}
        body.update(changes)
        return body

    def build(self, bodies, old=None):
        current = {"intake242": {str(i): {"body": b, "attempted": True, "state": "outcome_unknown"}
                                 for i, b in enumerate(bodies)}, "outbox": [{"never": "dispatch"}]}
        archive = {"originals": old or []}
        before = copy.deepcopy((current, archive))
        result = module.make_inventory(current, archive, "c" * 64, "d" * 64)
        self.assertEqual((current, archive), before)
        return result

    def test_original_signed_values_preserved_without_unsigned_time(self):
        body = self.row()
        obs = self.build([body])["groups"][0]["observations"][0]
        self.assertEqual(obs["nativeMembership"], body["nativeMembership"])
        self.assertFalse(obs["nativeMembership"]["member"])
        self.assertEqual(set(obs), {"input", "source", "character", "guid", "code", "nativeMembership"})

    def test_different_sender_and_both_inventories_survive(self):
        result = self.build([self.row(), self.row(character="Different Member", guid="Player-4613-87654321")],
                            [{"path": "/ingest/verify", "body": self.row()}])
        observations = result["groups"][0]["observations"]
        self.assertEqual(len(observations), 3)
        self.assertEqual({row["input"] for row in observations}, {"intake242", "quarantine"})
        self.assertEqual(len({row["guid"] for row in observations}), 2)

    def test_unsupported_source_holds_entire_matching_code_group(self):
        result = self.build([self.row(), self.row(source="unclassified")])
        self.assertEqual(result["groups"], [])
        self.assertEqual(result["counts"]["groupsHeldForUnsupportedSource"], 1)

    def test_oversized_group_is_not_truncated_to_eligible_subset(self):
        result = self.build([self.row(character="Synthetic " + str(i)) for i in range(33)])
        self.assertEqual(result["groups"], [])
        self.assertEqual(result["counts"]["groupsHeldForSize"], 1)

    def test_nonverification_records_are_excluded_and_mail_stays_identifiable_as_mail(self):
        result = self.build([self.row(source="mail", guid=None), {"type": "donation", "code": "ABC1234"}],
                            [{"path": "/ingest/events", "body": self.row()},
                             {"path": "/ingest/roster", "body": self.row()}])
        self.assertEqual(result["counts"]["storedVerificationObservations"], 1)
        self.assertEqual(result["groups"][0]["observations"][0]["source"], "mail")

    def test_identical_duplicates_cannot_consume_group_cap(self):
        result = self.build([self.row() for _ in range(40)])
        self.assertEqual(result["counts"]["storedVerificationObservations"], 40)
        self.assertEqual(len(result["groups"][0]["observations"]), 1)


if __name__ == "__main__":
    unittest.main()

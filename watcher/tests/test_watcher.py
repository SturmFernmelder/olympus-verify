"""Run from watcher/:  python -m unittest discover -s tests -v"""
from __future__ import annotations

import contextlib
import io
import json
import os
import sys
import tempfile
import time
import unittest
import http.client
import urllib.error
import urllib.request
import urllib.response
from datetime import datetime, timezone
from email.message import Message
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import codes  # noqa: E402
import savedvars  # noqa: E402
import watcher  # noqa: E402

VECTORS = json.loads((Path(__file__).parent / "vectors.json").read_text(encoding="utf-8"))

SV_SAMPLE = r'''
OlympusVerifyDB = {
	["version"] = 1,
	["events"] = {
		{
			["ts"] = 1789650000,
			["type"] = "whisper",
			["name"] = "Thrall",
			["code"] = "3FYWNZ",
			["ok"] = true,
		}, -- [1]
		{
			["ts"] = 1789650100,
			["type"] = "mail",
			["name"] = "Aelin Stormwarden",
			["code"] = "NUUMRK",
			["ok"] = true,
			["detail"] = "subject: \"hi\" \124cff00ff00pipe\124r",
		}, -- [2]
		{
			["ts"] = 1789650200,
			["type"] = "invite",
			["name"] = "Thrall",
			["ok"] = true,
		}, -- [3]
	},
	["roster"] = {
		["exportedAt"] = 1789650300,
		["members"] = {
			{
				["name"] = "Fernmelder",
				["rank"] = "Guild Master",
				["rankIndex"] = 0,
				["level"] = 60,
				["class"] = "Warlock",
				["note"] = "",
				["onote"] = "",
				["guid"] = "Player-1234-000ABCDE",
				["lastOnline"] = 0,
			}, -- [1]
			{
				["name"] = "Thrall",
				["rank"] = "Member",
				["rankIndex"] = 4,
				["level"] = 12,
				["class"] = "Shaman",
				["note"] = "D:123456789012345678",
				["lastOnline"] = 3600,
			}, -- [2]
		},
	},
	["empty"] = {
	},
	["neg"] = -1.5,
	["hex"] = 0x10,
	["long"] = [==[two
lines]==],
}
OlympusVerifyConfigCache = {
	["x"] = false,
}
'''


class CodeTests(unittest.TestCase):
    def test_vectors(self):
        for v in VECTORS:
            self.assertEqual(codes.normalize_character(v["character"]), v["normalized"], v)
            self.assertEqual(codes.code_for(v["secret"], v["character"], v["day"]), v["code"], v)

    def test_tolerance(self):
        self.assertTrue(codes.is_valid_code("olympus-test-secret", "Thrall", "3fy wnz", datetime(2026, 9, 18, 3, tzinfo=timezone.utc)))
        self.assertFalse(codes.is_valid_code("olympus-test-secret", "Thrall", "3FYWNZ", datetime(2026, 9, 19, 3, tzinfo=timezone.utc)))
        self.assertFalse(codes.is_valid_code("olympus-test-secret", "Thrall", "3FYWN", datetime(2026, 9, 17, tzinfo=timezone.utc)))


class SavedVarsTests(unittest.TestCase):
    def test_parse(self):
        d = savedvars.parse(SV_SAMPLE)
        db = d["OlympusVerifyDB"]
        self.assertEqual(db["version"], 1)
        self.assertEqual(len(db["events"]), 3)
        self.assertEqual(db["events"][1]["name"], "Aelin Stormwarden")
        self.assertEqual(db["events"][1]["detail"], 'subject: "hi" |cff00ff00pipe|r')
        self.assertEqual(db["roster"]["members"][1]["note"], "D:123456789012345678")
        self.assertEqual(db["roster"]["members"][0]["lastOnline"], 0)
        self.assertEqual(db["empty"], {})
        self.assertEqual(db["neg"], -1.5)
        self.assertEqual(db["hex"], 16)
        self.assertEqual(db["long"], "two\nlines")
        self.assertIs(d["OlympusVerifyConfigCache"]["x"], False)

    def test_rejects_code(self):
        with self.assertRaises(ValueError):
            savedvars.parse('X = { ["a"] = os.execute("rm -rf /") }')


class WatcherTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        wow = Path(self.tmp.name)
        (wow / "Logs").mkdir()
        (wow / "WTF" / "Account" / "ACC" / "SavedVariables").mkdir(parents=True)
        (wow / "Interface" / "AddOns" / "OlympusVerify").mkdir(parents=True)
        self.wow = wow
        self.calls: list[tuple[str, str, object]] = []
        cfg = {"worker_url": "https://example.invalid", "watcher_token": "t", "verify_secret": "olympus-test-secret", "wow_dir": str(wow), "account": "ACC", "officer_character": "Fernmelder", "state_file": str(wow / "state.json")}
        self.w = watcher.Watcher(cfg)
        self.up = True  # flip to False to simulate the Worker being unreachable
        def _call(method, path, body=None, retries=3):
            self.calls.append((method, path, body))
            if not self.up:
                return False, "unreachable"
            return True, ({"entries": [], "setGuildNote": False} if path == "/queue" else {"result": "verified"})
        self.w.worker.call = _call  # type: ignore[method-assign]

    def tearDown(self):
        self.tmp.cleanup()

    def test_chat_tail_forwards_only_valid_new_lines(self):
        import datetime as _dt

        day = _dt.datetime(2026, 9, 17, 12, tzinfo=_dt.timezone.utc)
        real_valid = codes.valid_codes
        codes.valid_codes = lambda s, c, now=None: real_valid(s, c, day)  # type: ignore[assignment]
        S = "olympus-test-secret"
        old_code = codes.code_for(S, "Oldtimer", "2026-09-17")
        thrall = codes.code_for(S, "Thrall", "2026-09-17")
        aelin = codes.code_for(S, "Aelin Stormwarden", "2026-09-16")  # yesterday's code, still valid
        try:
            log = self.wow / "Logs" / "WoWChatLog.txt"
            log.write_text(f"9/17 08:00:00.000  Oldtimer whispers: !verify {old_code}\n", encoding="utf-8")
            self.w.tail_chat_log()  # first run: starts at the end, does not replay history
            self.assertEqual(self.calls, [])
            with open(log, "a", encoding="utf-8") as f:
                f.write(f"9/17 08:12:34.567  Thrall whispers: !verify {thrall.lower()}\n")
                f.write(f"9/17 08:12:40.000  Thrall whispers: !verify {thrall}\n")  # duplicate
                f.write("9/17 08:12:50.000  Someone whispers: !verify ABCDEF\n")  # invalid
                f.write("9/17 08:13:00.000  To Thrall: thanks\n")  # outgoing, ignored
                f.write(f"9/17 08:13:10.000  Aelin Stormwarden whispers: !verify {aelin}")  # partial line (no newline yet)
            self.w.tail_chat_log()
            self.assertEqual([c[2]["character"] for c in self.calls], ["Thrall"])
            with open(log, "a", encoding="utf-8") as f:
                f.write("\n")
            self.w.tail_chat_log()
            self.assertEqual([c[2]["character"] for c in self.calls], ["Thrall", "Aelin Stormwarden"])
            self.w.tail_chat_log()  # nothing new
            self.assertEqual(len(self.calls), 2)
            # a fresh Watcher with the persisted state must not replay anything either
            w2 = watcher.Watcher(self.w.cfg)
            w2.worker.call = self.w.worker.call  # type: ignore[method-assign]
            w2.tail_chat_log()
            self.assertEqual(len(self.calls), 2)
        finally:
            codes.valid_codes = real_valid  # type: ignore[assignment]

    def test_chat_tail_relays_guild_joins_and_departures(self):
        log = self.wow / "Logs" / "WoWChatLog.txt"
        log.write_text("9/17 08:00:00.000  Olden Member has joined the guild.\n", encoding="utf-8")
        self.w.tail_chat_log()  # history is never replayed
        self.assertEqual(self.calls, [])
        with open(log, "a", encoding="utf-8") as f:
            f.write("9/17 19:15:06.335  Saltine Crackur has gone offline.\n")  # unrelated system line
            f.write("9/17 19:15:07.372  |Hchannel:GUILD|h[Guild]|h Revora Xd: has joined the guild.\n")  # chat, not a system line
            f.write("9/17 19:16:00.000  Aelin Stormwarden has joined the guild.\n")
            f.write("9/17 19:16:00.000  Aelin Stormwarden has joined the guild.\n")  # duplicate flush
            f.write("9/17 19:17:00.000  Dorn Late has left the guild.\n")
            f.write("9/17 19:18:00.000  Bad Actor has been kicked out of the guild by Fern Melder.\n")
        self.w.tail_chat_log()
        events = [c[2]["events"][0] for c in self.calls if c[1] == "/ingest/events"]
        self.assertEqual([(e["type"], e["name"]) for e in events], [("joined", "Aelin Stormwarden"), ("left", "Dorn Late"), ("left", "Bad Actor")])
        self.assertEqual(events[2]["detail"], "kicked by Fern Melder")
        self.w.tail_chat_log()
        self.assertEqual(len(self.calls), 3)

    def test_savedvars_roster_and_events(self):
        sv = self.wow / "WTF" / "Account" / "ACC" / "SavedVariables" / "OlympusVerify.lua"
        sv.write_text(SV_SAMPLE, encoding="utf-8")
        self.w.check_savedvars()
        paths = [c[1] for c in self.calls]
        self.assertIn("/ingest/roster", paths)
        self.assertIn("/ingest/events", paths)
        roster = next(c[2] for c in self.calls if c[1] == "/ingest/roster")
        self.assertEqual(roster["exportedAt"], 1789650300)
        self.assertEqual(roster["members"][1]["note"], "D:123456789012345678")
        n = len(self.calls)
        self.w.check_savedvars()  # unchanged mtime -> nothing
        self.assertEqual(len(self.calls), n)

    def test_queue_render(self):
        body = watcher.Watcher.render_queue([{"id": 7, "character": 'Thr"all', "discordId": "123", "note": "D:123", "status": "queued"}], True)
        self.assertIn('character = "Thr\\"all"', body)
        self.assertIn("setGuildNote = true", body)
        self.assertTrue(body.startswith("-- Generated"))


class ResilienceTests(unittest.TestCase):
    """The behaviours that were silently wrong before 18 Sep: lost events, a re-arming first-run branch, an
    unescapable queue file, a dedupe hash that never matched, and guild lines nobody could authenticate."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        wow = Path(self.tmp.name)
        (wow / "Logs").mkdir()
        (wow / "WTF" / "Account" / "ACC" / "SavedVariables").mkdir(parents=True)
        (wow / "Interface" / "AddOns" / "OlympusVerify").mkdir(parents=True)
        self.wow = wow
        self.log = wow / "Logs" / "WoWChatLog.txt"
        self.calls: list[tuple[str, str, object]] = []
        self.up = True
        cfg = {
            "worker_url": "https://example.invalid",
            "watcher_token": "t",
            "verify_secret": "olympus-test-secret",
            "wow_dir": str(wow),
            "account": "ACC",
            "officer_character": "Fern Melder",
            "state_file": str(wow / "state.json"),
        }
        self.w = watcher.Watcher(cfg)

        def _call(method, path, body=None, retries=3):
            self.calls.append((method, path, body))
            if not self.up:
                return False, "unreachable"
            return True, ({"entries": [], "setGuildNote": False} if path == "/queue" else {"ok": True})

        self.w.worker.call = _call  # type: ignore[method-assign]

    def tearDown(self):
        self.tmp.cleanup()

    def _pad(self, n=400):
        # keep the file above the fingerprint prefix so rotation detection is meaningful
        return "9/18 00:00:00.000  filler\n" * (n // 24 + 1)

    def test_events_survive_a_worker_outage(self):
        code = codes.code_for("olympus-test-secret", "Thrall", codes.day_bucket(datetime.now(timezone.utc)))
        self.log.write_text(self._pad(), encoding="utf-8")
        self.w.tail_chat_log()  # initialise at the end

        self.up = False
        with open(self.log, "a", encoding="utf-8") as f:
            f.write(f"9/18 08:00:00.000  Thrall whispers: !verify {code}\n")
        self.w.tail_chat_log()
        self.assertEqual(self.w.state.d["outbox"], self.w.state.d["outbox"])
        self.assertEqual(len(self.w.state.d["outbox"]), 1, "the verification is buffered, not dropped")

        # a restart must not lose it either
        self.w.state.save()
        w2 = watcher.Watcher({**self.w.cfg})
        sent: list[tuple[str, object]] = []
        w2.worker.call = lambda m, p, b=None, retries=3: (sent.append((p, b)) or (True, {"ok": True}))  # type: ignore[method-assign]
        w2.flush_outbox()
        self.assertEqual([p for p, _ in sent], ["/ingest/verify"], "buffered work is delivered after a restart")
        self.assertEqual(w2.state.d["outbox"], [], "the outbox drains once the Worker answers")

    def test_zero_byte_log_does_not_swallow_the_next_lines(self):
        code = codes.code_for("olympus-test-secret", "Thrall", codes.day_bucket(datetime.now(timezone.utc)))
        self.log.write_text("", encoding="utf-8")
        self.w.tail_chat_log()          # first run on an empty file
        self.log.write_text(f"9/18 08:00:00.000  Thrall whispers: !verify {code}\n", encoding="utf-8")
        self.w.tail_chat_log()          # must read it, not re-arm the first-run branch
        self.assertEqual([p for _, p, _ in self.calls], ["/ingest/verify"])

    def test_recreated_log_is_not_seeked_into(self):
        self.log.write_text(self._pad(800), encoding="utf-8")
        self.w.tail_chat_log()
        big_offset = self.w.state.d["chat_offset"]
        self.assertGreater(big_offset, 400)
        # a different file of similar size under the same name
        self.log.write_text("9/18 09:00:00.000  other\n" * 60, encoding="utf-8")
        self.w.tail_chat_log()
        self.assertLessEqual(self.w.state.d["chat_offset"], self.log.stat().st_size)
        self.assertEqual(self.calls, [], "history from an unrelated file is not replayed")

    def test_queue_file_escapes_control_characters(self):
        body = watcher.Watcher.render_queue([{"id": 1, "character": "Bad\rName", "discordId": "1", "note": "a\nb"}], False)
        self.assertNotIn("\r", body.split("entries")[1], "a raw CR would make the Lua file unparseable")
        self.assertIn("\\r", body)

    def test_queue_hash_is_stable_across_seconds(self):
        entries = [{"id": 7, "character": "Thrall", "discordId": "1", "note": "", "status": "queued"}]
        self.w.worker.call = lambda m, p, b=None, retries=3: (True, {"entries": entries, "setGuildNote": False})  # type: ignore[method-assign]
        self.w.pull_queue()
        first = self.w.state.d["queue_hash"]
        self.w._last_queue_pull = 0
        time.sleep(1.1)
        self.w.pull_queue()
        self.assertEqual(first, self.w.state.d["queue_hash"], "generatedAt must not be part of the dedupe hash")

    def test_signed_join_is_trusted_and_plain_text_is_not(self):
        self.log.write_text(self._pad(), encoding="utf-8")
        self.w.tail_chat_log()
        token = codes.join_token("olympus-test-secret", "Aelin Stormwarden", codes.day_bucket(datetime.now(timezone.utc)))
        with open(self.log, "a", encoding="utf-8") as f:
            f.write("9/18 08:00:00.000  Sneaky has joined the guild.\n")                       # /emote forgery
            f.write(f"9/18 08:00:05.000  To Aelin Stormwarden: welcome (ref OLVj-{token})\n")  # the addon's own line
        self.w.tail_chat_log()
        events = [e for _, p, b in self.calls if p == "/ingest/events" for e in b["events"]]
        by_name = {e["name"]: e for e in events}
        self.assertEqual(by_name["Sneaky"]["origin"], "chatlog", "a forgeable line is marked untrusted")
        self.assertEqual(by_name["Aelin Stormwarden"]["origin"], "token", "a signed line is trusted")

    def test_signed_join_note_to_self_is_trusted(self):
        """A new member who never whispered the officer is not whispered (26 Sep). The addon signs the join in a note to
        itself instead, naming the member, and the MAC over that name is what makes it trusted."""
        self.log.write_text(self._pad(), encoding="utf-8")
        self.w.tail_chat_log()
        day = codes.day_bucket(datetime.now(timezone.utc))
        token = codes.join_token("olympus-test-secret", "Quiet Joiner", day)
        officer = codes.join_token("olympus-test-secret", "Fern Melder", day)
        with open(self.log, "a", encoding="utf-8") as f:
            f.write(f"9/18 08:00:05.000  To Fern Melder: Olympus: Quiet Joiner joined the guild (ref OLVj-{token})\n")
            f.write(f"9/18 08:00:05.000  Fern Melder whispers: Olympus: Quiet Joiner joined the guild (ref OLVj-{token})\n")
            # a MAC for the officer's own name does not vouch for the member named in the note
            f.write(f"9/18 08:00:06.000  To Fern Melder: Olympus: Forged Name joined the guild (ref OLVj-{officer})\n")
        self.w.tail_chat_log()
        events = [e for _, p, b in self.calls if p == "/ingest/events" for e in b["events"]]
        self.assertEqual([(e["name"], e["origin"]) for e in events], [("Quiet Joiner", "token")],
                         "the member named in the note joins, once, trusted; the forged note is dropped")

    def test_full_guild_and_seat_removals_are_relayed(self):
        """The shortlist has to reach Discord, and a seat freed must not look like an ordinary departure."""
        sv = self.wow / "WTF" / "Account" / "ACC" / "SavedVariables" / "OlympusVerify.lua"
        now = int(time.time())  # recent: SavedVariables departures older than SV_EVENT_MAX_AGE are not relayed
        sv.write_text(
            'OlympusVerifyDB = {\n'
            '  ["events"] = {\n'
            f'    {{ ["type"] = "guild_full", ["ts"] = {now}, ["ok"] = false, ["detail"] = "3 eligible for removal",\n'
            '      ["candidates"] = {\n'
            '        { ["name"] = "Longer Gone", ["level"] = 60, ["rank"] = "Member", ["days"] = 180 },\n'
            '        { ["name"] = "Long Gone", ["level"] = 22, ["rank"] = "Initiate", ["days"] = 120 },\n'
            '      } },\n'
            f'    {{ ["type"] = "removed", ["name"] = "Longer Gone", ["ts"] = {now + 1}, ["ok"] = true,\n'
            '      ["reason"] = "space", ["detail"] = "freed a seat" },\n'
            '  },\n'
            '  ["roster"] = { ["exportedAt"] = 0, ["members"] = {} },\n'
            '}\n',
            encoding="utf-8",
        )
        self.w.check_savedvars()
        events = [e for _, p, b in self.calls if p == "/ingest/events" for e in b["events"]]
        by_type = {e["type"]: e for e in events}
        self.assertIn("guild_full", by_type, "a full guild is reported")
        self.assertEqual(
            [c["name"] for c in by_type["guild_full"]["candidates"]],
            ["Longer Gone", "Long Gone"],
            "with the addon's shortlist intact and in order",
        )
        self.assertEqual(by_type["removed"]["reason"], "space", "a seat freed carries its reason")
        self.assertEqual(by_type["removed"]["origin"], "addon", "and is authoritative, so the role comes off at once")

    def test_queue_is_claimed_under_this_officer(self):
        """Two officers running the addon must not both be handed the same invite."""
        self.assertEqual(self.w.officer_id, "fern melder")
        entries = [{"id": 7, "character": "Thrall", "discordId": "1", "note": "", "status": "queued"}]
        seen: list[tuple[str, str, object]] = []

        def _call(method, path, body=None, retries=3):
            seen.append((method, path, body))
            if path.startswith("/queue?"):
                return True, {"entries": entries, "setGuildNote": False, "officer": "fern melder"}
            return True, {"marked": 1}

        self.w.worker.call = _call  # type: ignore[method-assign]
        self.w.pull_queue()
        # Since the 25 Sep unverified list, pull_queue() refreshes /queue/unverified first, so look for the queue
        # request by path instead of assuming it is the first call.
        paths = [p for _, p, _ in seen]
        self.assertIn("/queue/unverified", paths, "the unverified list is refreshed with the queue")
        queue_calls = [p for p in paths if p.startswith("/queue?")]
        self.assertEqual(len(queue_calls), 1)
        self.assertTrue(queue_calls[0].startswith("/queue?officer=fern%20melder"), "the watcher identifies itself when asking for work")
        self.assertIn("relay=Fern+Melder", queue_calls[0], "and says which character to whisper")
        self.assertNotIn("online=", queue_calls[0], "without claiming presence it cannot see (no client here)")
        written = [b for m, p, b in seen if p == "/queue/written"]
        self.assertEqual(written, [{"ids": [7], "officer": "fern melder"}], "and when acknowledging what it wrote")

    def test_bad_signature_is_ignored(self):
        self.log.write_text(self._pad(), encoding="utf-8")
        self.w.tail_chat_log()
        with open(self.log, "a", encoding="utf-8") as f:
            f.write("9/18 08:00:05.000  To Aelin Stormwarden: welcome (ref OLVj-deadbeef00)\n")
        self.w.tail_chat_log()
        self.assertEqual(self.calls, [], "a join token that does not verify is dropped")


def _stamp(dt=None) -> str:
    """A chat-log timestamp as the client writes it: local time, month/day without leading zeros."""
    dt = dt or datetime.now()
    return f"{dt.month}/{dt.day} {dt:%H:%M:%S}.000"


class SignedEventTests(unittest.TestCase):
    """27 Sep 2026: request codes, signed departures, the trusted-join dedupe fix, lag and presence."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        wow = Path(self.tmp.name)
        (wow / "Logs").mkdir()
        (wow / "WTF" / "Account" / "ACC" / "SavedVariables").mkdir(parents=True)
        (wow / "Interface" / "AddOns" / "OlympusVerify").mkdir(parents=True)
        self.wow = wow
        self.log = wow / "Logs" / "WoWChatLog.txt"
        self.calls: list[tuple[str, str, object]] = []
        self.cfg = {"worker_url": "https://example.invalid", "watcher_token": "t", "verify_secret": "olympus-test-secret", "wow_dir": str(wow),
                    "account": "ACC", "officer_character": "Fern Melder", "state_file": str(wow / "state.json")}
        self.w = self._watcher()

    def _watcher(self):
        w = watcher.Watcher(self.cfg)
        w.worker.call = lambda method, path, body=None, retries=3: (self.calls.append((method, path, body)) or (True, {"result": "ok"}))  # type: ignore[method-assign]
        return w

    def tearDown(self):
        self.tmp.cleanup()

    def _start(self):
        self.log.write_text("x" * 300 + "\n", encoding="utf-8")
        self.w.tail_chat_log()

    def _append(self, *lines):
        with open(self.log, "a", encoding="utf-8") as f:
            for line in lines:
                f.write(line + "\n")
        self.w.tail_chat_log()

    def _events(self):
        return [e for _, p, b in self.calls if p == "/ingest/events" for e in b["events"]]

    def _day(self):
        return codes.day_bucket(datetime.now(timezone.utc))

    def test_signed_join_survives_the_system_line_before_it(self):
        """The client writes "X has joined the guild." first and the addon's signed note a moment later. They used to
        share a dedupe key, so the untrusted line won and the signed note -- the one that grants the role -- was dropped."""
        self._start()
        tok = codes.join_token("olympus-test-secret", "Quiet Joiner", self._day())
        self._append(f"{_stamp()}  Quiet Joiner has joined the guild.",
                     f"{_stamp()}  To Fern Melder: Olympus: Quiet Joiner joined the guild (ref OLVj-{tok})")
        self.assertEqual([(e["name"], e["origin"]) for e in self._events()], [("Quiet Joiner", "chatlog"), ("Quiet Joiner", "token")])

    def test_request_code_whisper_is_forwarded(self):
        self._start()
        ticket = codes.ticket_for("olympus-test-secret", "K7Q", self._day())
        self._append(f"{_stamp()}  Any Character whispers: !verify {ticket.lower()}",
                     f"{_stamp()}  Guess Work whispers: !verify K7Q2222")
        verifies = [b for _, p, b in self.calls if p == "/ingest/verify"]
        self.assertEqual([(v["character"], v["code"]) for v in verifies], [("Any Character", ticket)],
                         "a request code is forwarded under its sender; a wrong mac is not")

    def test_signed_departures_carry_their_kind(self):
        self._start()
        day = self._day()
        lines = []
        for name, what, kind in (("Gone Gus", "left the guild", "left"), ("Kicked Kim", "was removed from the guild", "kicked"),
                                 ("Seat Sam", "was removed to free a seat", "space"), ("Lurker Lu", "was removed as unverified", "unverified")):
            tok = codes.leave_token("olympus-test-secret", kind, name, day)
            lines.append(f"{_stamp()}  To Fern Melder: Olympus: {name} {what} (ref OLVl-{tok})")
        # a MAC for the wrong kind does not vouch for this one
        wrong = codes.leave_token("olympus-test-secret", "left", "Forged Fay", day)
        lines.append(f"{_stamp()}  To Fern Melder: Olympus: Forged Fay was removed to free a seat (ref OLVl-{wrong})")
        self._append(*lines)
        got = [(e["type"], e["name"], e.get("reason"), e["origin"]) for e in self._events()]
        self.assertEqual(got, [("left", "Gone Gus", None, "token"), ("left", "Kicked Kim", None, "token"),
                               ("removed", "Seat Sam", "space", "token"), ("removed", "Lurker Lu", "unverified", "token")])

    def test_departure_line_and_signed_note_are_both_forwarded_once(self):
        self._start()
        tok = codes.leave_token("olympus-test-secret", "left", "Gone Gus", self._day())
        note = f"{_stamp()}  To Fern Melder: Olympus: Gone Gus left the guild (ref OLVl-{tok})"
        self._append(f"{_stamp()}  Gone Gus has left the guild.", note, note.replace("To Fern Melder:", "Fern Melder whispers:"))
        self.assertEqual([(e["name"], e["origin"]) for e in self._events()], [("Gone Gus", "chatlog"), ("Gone Gus", "token")],
                         "the untrusted line flags, the signed note removes -- and the incoming copy of the note is not trusted")
        sv = self.wow / "WTF" / "Account" / "ACC" / "SavedVariables" / "OlympusVerify.lua"
        sv.write_text('OlympusVerifyDB = { ["events"] = { { ["type"] = "left", ["name"] = "Gone Gus", ["ts"] = %d, ["ok"] = true } } }\n' % int(time.time()), encoding="utf-8")
        self.w.check_savedvars()
        self.assertEqual(len(self._events()), 2, "the addon's own copy of the same departure is not sent a second time")

    def test_lag_is_measured_per_line(self):
        self._start()
        ticket = codes.ticket_for("olympus-test-secret", "ABC", self._day())
        old = datetime.fromtimestamp(time.time() - 300)
        self._append(f"{_stamp()}  Fast Fiona whispers: !verify {ticket}", f"{_stamp(old)}  Slow Sam has left the guild.")
        kinds = [(k, lag) for k, lag, _ in self.w.state.d["lag"]]
        self.assertEqual([k for k, _ in kinds], ["whisper", "system"])
        self.assertLess(kinds[0][1], 5, "a line read at once shows a lag of seconds")
        self.assertGreater(kinds[1][1], 250, "a line that waited for the batch shows minutes")
        self.assertIn("median", self.w.lag_summary())

    def test_diag_markers_are_timed_wherever_they_land(self):
        (self.wow / "Logs" / "DeveloperLog.log").write_text(f"old OLVDIAG clog {int(time.time()) - 999}\n", encoding="utf-8")
        self.w = self._watcher()  # what is already in the other logs at start is not news
        self._start()
        now = int(time.time())
        self._append(f"{_stamp()}  To Fern Melder: Olympus log test OLVDIAG flush {now - 3}")
        time.sleep(0.05)
        with open(self.wow / "Logs" / "DeveloperLog.log", "a", encoding="utf-8") as f:
            f.write(f"new OLVDIAG clog-message {now - 1}\n")
        os.utime(self.wow / "Logs" / "DeveloperLog.log", (time.time() + 5, time.time() + 5))
        self.w._last_diag_scan = 0
        self.w.scan_diag_logs()
        diag = [(d["tag"], d["file"]) for d in self.w.state.d["diag"]]
        self.assertEqual(diag, [("flush", "WoWChatLog.txt"), ("clog-message", "DeveloperLog.log")])
        self.assertLess(self.w.state.d["diag"][0]["lag"], 10)

    def test_presence_follows_the_client_log(self):
        client = self.wow / "Logs" / "Client.log"
        client.write_text("9/27 10:00:00.000  Active Player Created\n", encoding="utf-8")
        self.w._wow_running = lambda: True  # type: ignore[method-assign]  0.6.5: a known running process is needed too
        self.assertIs(self.w.officer_online(), True)
        self.assertIn("online=1", self.w.presence_query())
        client.write_text(client.read_text(encoding="utf-8") + "9/27 11:00:00.000  Client Object Manager Destroyed\n", encoding="utf-8")
        self.w._presence_at = 0
        self.assertIs(self.w.officer_online(), False)
        self.assertIn("online=0", self.w.presence_query())
        client.unlink()
        self.w._presence_at = 0
        self.assertIsNone(self.w.officer_online(), "process running, no client log (a login screen looks like this): claim nothing")
        self.assertNotIn("online=", self.w.presence_query())

    def test_partly_unknown_presence_claims_nothing(self):
        """The v3 proposal's presence repair (Codex manifest a086e904…, countersigned 1 Oct 2026 02:15 UTC), ported in 0.6.5."""
        client = self.wow / "Logs" / "Client.log"
        client.write_text("9/27 10:00:00.000  Active Player Created\n", encoding="utf-8")
        self.w._wow_running = lambda: None  # type: ignore[method-assign]
        self.assertIsNone(self.w.officer_online(), "the process list cannot be asked: an in-world line alone proves nothing (a crashed client leaves it behind)")
        self.assertNotIn("online=", self.w.presence_query())
        self.assertIn("relay=Fern+Melder", self.w.presence_query(), "the character and the versions are still reported")
        self.w._presence_at = 0
        self.w._wow_running = lambda: False  # type: ignore[method-assign]
        self.assertIs(self.w.officer_online(), False, "a known stopped process is offline whatever the log says")
        self.assertIn("online=0", self.w.presence_query())
        self.w._presence_at = 0
        client.unlink()
        self.w._wow_running = lambda: True  # type: ignore[method-assign]
        self.assertIsNone(self.w.officer_online(), "running but no in-world state: not claimed as online (0.6.4 said online=1 here)")
        self.assertNotIn("online=", self.w.presence_query())


class HardeningTests(SignedEventTests):
    """The review of 27 Sep: one request code links one character, tokens are exact, an upgrade replays nothing,
    presence can never stop the queue poll, the login note names the character actually playing, and diagnostics only
    come from the officer's own lines."""

    # the parent's tests are not re-run here
    test_signed_join_survives_the_system_line_before_it = None  # type: ignore[assignment]
    test_request_code_whisper_is_forwarded = None  # type: ignore[assignment]
    test_signed_departures_carry_their_kind = None  # type: ignore[assignment]
    test_departure_line_and_signed_note_are_both_forwarded_once = None  # type: ignore[assignment]
    test_lag_is_measured_per_line = None  # type: ignore[assignment]
    test_diag_markers_are_timed_wherever_they_land = None  # type: ignore[assignment]
    test_presence_follows_the_client_log = None  # type: ignore[assignment]
    test_partly_unknown_presence_claims_nothing = None  # type: ignore[assignment]

    def _verifies(self):
        return [(b["character"], b["code"]) for _, p, b in self.calls if p == "/ingest/verify"]

    def test_a_request_code_is_relayed_for_its_first_sender_only(self):
        self._start()
        ticket = codes.ticket_for("olympus-test-secret", "K7Q", self._day())
        self._append(f"{_stamp()}  Kira Moonfall whispers: !verify {ticket}",
                     f"{_stamp()}  Other Guy whispers: !verify {ticket}",
                     f"{_stamp()}  Kira Moonfall whispers: !verify {ticket}")
        self.assertEqual(self._verifies(), [("Kira Moonfall", ticket)], "the second character's whisper of the same code goes nowhere")
        sv = self.wow / "WTF" / "Account" / "ACC" / "SavedVariables" / "OlympusVerify.lua"
        sv.write_text('OlympusVerifyDB = { ["events"] = { { ["type"] = "whisper", ["name"] = "Kira Moonfall", ["code"] = "%s", ["ok"] = true, ["ts"] = %d } } }\n'
                      % (ticket, int(time.time())), encoding="utf-8")
        self.w.check_savedvars()
        self.assertEqual(len(self._verifies()), 1, "and the addon's copy of the first one is not sent again")

    def test_a_character_code_is_still_relayed_per_sender(self):
        self._start()
        code = codes.code_for("olympus-test-secret", "Thrall", self._day())
        self._append(f"{_stamp()}  Thrall whispers: !verify {code}", f"{_stamp()}  Thrall whispers: !verify {code}")
        self.assertEqual(self._verifies(), [("Thrall", code)])

    def test_only_an_exact_token_is_a_code(self):
        self._start()
        ticket = codes.ticket_for("olympus-test-secret", "ABC", self._day())
        self._append(f"{_stamp()}  Extra Digit whispers: !verify {ticket}1",
                     f"{_stamp()}  Leading Zero whispers: !verify 0{ticket[:6]}",
                     f"{_stamp()}  Phone Typer whispers: !Verify {ticket.lower()}.")
        self.assertEqual(self._verifies(), [("Phone Typer", ticket)],
                         "trailing or leading junk is refused (the addon refuses it too); case and punctuation after it are fine")

    def test_an_upgrade_does_not_resend_what_was_relayed_under_the_old_keys(self):
        # a 0.5.x state: joins and departures from SavedVariables were relayed under "j:"/"l:" keys
        now = int(time.time())
        old = now - 3600
        pre = watcher.State(Path(self.cfg["state_file"]))
        pre.d.pop("trusted_keys_since", None)
        for key in (f"j:seat sam:{old // 600}", f"l:gone gus:{old // 600}"):
            pre.seen(key)
        pre.save()
        self.w = self._watcher()  # first run of this version: remembers when trusted keys started
        self.assertGreaterEqual(self.w.state.d["trusted_keys_since"], now)
        sv = self.wow / "WTF" / "Account" / "ACC" / "SavedVariables" / "OlympusVerify.lua"
        sv.write_text(
            'OlympusVerifyDB = { ["events"] = {\n'
            f'  {{ ["type"] = "joined", ["name"] = "Seat Sam", ["ts"] = {old}, ["ok"] = true }},\n'
            f'  {{ ["type"] = "left", ["name"] = "Gone Gus", ["ts"] = {old}, ["ok"] = true }},\n'
            f'  {{ ["type"] = "left", ["name"] = "Never Sent", ["ts"] = {old}, ["ok"] = true }},\n'
            f'  {{ ["type"] = "joined", ["name"] = "New Nina", ["ts"] = {now + 5}, ["ok"] = true }},\n'
            f'  {{ ["type"] = "left", ["name"] = "Ancient Al", ["ts"] = {now - 7 * 3600}, ["ok"] = true }},\n'
            '} }\n', encoding="utf-8")
        self.w.check_savedvars()
        self.assertEqual([(e["type"], e["name"]) for e in self._events()], [("left", "Never Sent"), ("joined", "New Nina")],
                         "already relayed: not again; never relayed: now; newer than the upgrade: under the new keys; older than 6 h: not at all")

    def test_presence_failures_never_stop_the_queue_poll(self):
        client = self.wow / "Logs" / "Client.log"
        client.write_text("9/27 10:00:00.000  Active Player Created\n", encoding="utf-8")

        def boom():
            raise UnicodeDecodeError("cp1252", b"\x81", 0, 1, "undefined")
        self.w.officer_online = boom  # type: ignore[method-assign]
        self.assertEqual(self.w.presence_query(), "", "a failure reports nothing ...")
        self.w._last_queue_pull = 0
        self.w.pull_queue()
        self.assertTrue(any(p.startswith("/queue?officer=") for _, p, _b in self.calls), "... and the queue is still fetched")

    def test_the_process_list_is_read_as_bytes(self):
        from unittest import mock
        (self.wow / "WowB.exe").write_bytes(b"")
        out = b'"Pr\x81fung.exe","11","Console","1","1.024 K"\r\n"WowB.exe","4242","Console","1","2.048 K"\r\n'
        fake = mock.Mock(return_value=mock.Mock(stdout=out))
        with mock.patch.object(watcher.os, "name", "nt"), mock.patch.object(watcher.subprocess, "run", fake):
            self.assertIs(self.w._wow_running(), True, "a byte no code page likes does not matter")

    def test_the_login_note_names_the_character_and_the_addon(self):
        client = self.wow / "Logs" / "Client.log"
        client.write_text("9/27 10:00:00.000  Active Player Created\n", encoding="utf-8")
        self._start()
        mac = codes.relay_token("olympus-test-secret", "Alt Fern", "0.6.0", self._day())
        forged = codes.relay_token("olympus-test-secret", "Alt Fern", "0.5.8", self._day())
        self._append(f"{_stamp()}  To Alt Fern: Olympus: relay Alt Fern is in the world (addon 0.6.1, ref OLVr-{forged})",
                     f"{_stamp()}  Alt Fern whispers: Olympus: relay Alt Fern is in the world (addon 0.6.0, ref OLVr-{mac})")
        self.assertEqual(self.w.state.d.get("relay") or {}, {}, "a wrong MAC, and the incoming copy, prove nothing")
        self._append(f"{_stamp()}  To Alt Fern: Olympus: relay Alt Fern is in the world (addon 0.6.0, ref OLVr-{mac})")
        self.assertEqual(self.w.state.d["relay"]["character"], "Alt Fern")
        self.w._wow_running = lambda: True  # type: ignore[method-assign]  0.6.5: the in-world line alone no longer claims online
        q = self.w.presence_query()
        self.assertIn("relay=Alt+Fern", q, "the reply names the character actually in the world")
        self.assertIn("addon=0.6.0", q, "and the Worker learns the addon understands request codes")
        self.assertIn("online=1", q)
        self.assertEqual(self._verifies(), [], "a note is not a code")

    def test_diag_markers_come_only_from_the_officers_own_lines(self):
        self._start()
        now = int(time.time())
        self._append(f"{_stamp()}  Prankster whispers: OLVDIAG flush {now}",
                     f"{_stamp()}  Prankster OLVDIAG flush {now - 1}")
        self.assertEqual(self.w.state.d.get("diag") or [], [])
        self._append(f"{_stamp()}  To Fern Melder: Olympus log test OLVDIAG flush {now - 2}")
        self.assertEqual([d["tag"] for d in self.w.state.d["diag"]], ["flush"])

    def test_only_ascii_counts_as_a_command_or_a_code(self):
        self._start()
        ticket = codes.ticket_for("olympus-test-secret", "HJK", self._day())
        long_s = ticket.replace("S", "\u017f") if "S" in ticket else None
        lines = [f"{_stamp()}  Nbsp Nina whispers: !verify\u00a0{ticket}",
                 f"{_stamp()}  Dotless Dia whispers: !ver\u0131fy {ticket}"]
        if long_s:
            lines.append(f"{_stamp()}  Long Sam whispers: !verify {long_s}")
        self._append(*lines)
        self.assertEqual(self._verifies(), [], "the addon's Lua patterns see none of these as a code, so neither does the watcher")
        self.assertIsNone(codes.strict_code("K7Q\u017fTG1"[:7]))

    def test_a_code_the_clock_refused_can_be_sent_again(self):
        from unittest import mock
        self._start()
        ticket = codes.ticket_for("olympus-test-secret", "WXY", self._day())
        with mock.patch.object(watcher.codes, "code_kind", return_value=None):
            self._append(f"{_stamp()}  Early Eve whispers: !verify {ticket}")
        self.assertEqual(self._verifies(), [])
        self._append(f"{_stamp()}  Early Eve whispers: !verify {ticket}")
        self.assertEqual(self._verifies(), [("Early Eve", ticket)], "refused once (a slow clock at midnight), not remembered as done")

    def test_an_old_login_note_does_not_vouch_for_the_addon(self):
        client = self.wow / "Logs" / "Client.log"
        client.write_text("9/27 10:00:00.000  Active Player Created\n", encoding="utf-8")
        self.w.state.d["relay"] = {"character": "Fern Melder", "addon": "0.6.0", "at": int(time.time()) - 15 * 86400}
        q = self.w.presence_query()
        self.assertIn("relay=Fern+Melder", q)
        self.assertNotIn("addon=", q)

    def test_the_whisperers_guid_travels_with_the_verification(self):
        self._start()
        ticket = codes.ticket_for("olympus-test-secret", "8N5", self._day())
        guid = "Player-4613-0ABCDEF1"
        mac = codes.guid_token("olympus-test-secret", "Guid Gail", guid, self._day())
        # the addon writes its note right after the whisper; both land in one write
        self._append(f"{_stamp()}  Guid Gail whispers: !verify {ticket}",
                     f"{_stamp()}  To Fern Melder: Olympus: Guid Gail is {guid} (ref OLVg-{mac})")
        bodies = [b for _, p, b in self.calls if p == "/ingest/verify"]
        self.assertEqual([(b["character"], b.get("guid")) for b in bodies], [("Guid Gail", guid)], "read ahead, so the verification carries it")
        ids = [e for e in self._events() if e["type"] == "identity"]
        self.assertEqual([(e["name"], e["guid"], e["origin"]) for e in ids], [("Guid Gail", guid, "token")], "and it is sent on its own as well")

    def test_a_forged_or_incoming_identity_note_proves_nothing(self):
        self._start()
        ticket = codes.ticket_for("olympus-test-secret", "T6V", self._day())
        guid = "Player-4613-0ABCDEF9"
        good = codes.guid_token("olympus-test-secret", "Forge Fay", guid, self._day())
        other = codes.guid_token("olympus-test-secret", "Forge Fay", "Player-4613-00000001", self._day())
        self._append(f"{_stamp()}  To Fern Melder: Olympus: Forge Fay is {guid} (ref OLVg-{other})",
                     f"{_stamp()}  Forge Fay whispers: Olympus: Forge Fay is {guid} (ref OLVg-{good})",
                     f"{_stamp()}  Forge Fay whispers: !verify {ticket}")
        bodies = [b for _, p, b in self.calls if p == "/ingest/verify"]
        self.assertEqual([b.get("guid") for b in bodies], [None])
        self.assertEqual([e for e in self._events() if e["type"] == "identity"], [])

    def test_savedvariables_carries_the_guid_too(self):
        ticket = codes.ticket_for("olympus-test-secret", "E9G", self._day())
        sv = self.wow / "WTF" / "Account" / "ACC" / "SavedVariables" / "OlympusVerify.lua"
        sv.write_text('OlympusVerifyDB = { ["events"] = { { ["type"] = "whisper", ["name"] = "Sv Sam", ["code"] = "%s", ["ok"] = true, ["ts"] = %d, ["guid"] = "Player-1-0000ABCD" } } }\n'
                      % (ticket, int(time.time())), encoding="utf-8")
        self.w.check_savedvars()
        bodies = [b for _, p, b in self.calls if p == "/ingest/verify"]
        self.assertEqual([(b["character"], b.get("guid")) for b in bodies], [("Sv Sam", "Player-1-0000ABCD")])

    def test_savedvariables_tells_the_addon_build_too(self):
        client = self.wow / "Logs" / "Client.log"
        client.write_text("9/27 10:00:00.000  Active Player Created\n", encoding="utf-8")
        sv = self.wow / "WTF" / "Account" / "ACC" / "SavedVariables" / "OlympusVerify.lua"
        # an 0.6.0 save: no addonVersion field yet, but presenceVersion is the loaded build
        sv.write_text('OlympusVerifyDB = { ["presenceVersion"] = "0.6.0", ["events"] = {} }\n', encoding="utf-8")
        self.w.check_savedvars()
        q = self.w.presence_query()
        self.assertIn("addon=0.6.0", q, "request codes can start without waiting for the chat log")
        self.assertIn("relay=Fern+Melder", q, "no character saved: the configured officer")
        # an 0.6.1 save names the character by UnitName alone -- on the 27 Sep client only its first part -- and no GUID
        roster = ('["roster"] = { ["members"] = { { ["name"] = "Fern Melder", ["guid"] = "Player-4613-005A70D8" }, '
                  '{ ["name"] = "Alt Fern", ["guid"] = "Player-4613-00AB12CD" } } }')
        sv.write_text('OlympusVerifyDB = { ["addonVersion"] = "0.6.1", ["lastCharacter"] = "Fern", %s, ["events"] = {} }\n' % roster,
                      encoding="utf-8")
        os.utime(sv, (time.time() + 2, time.time() + 2))
        self.w.check_savedvars()
        self.assertIn("relay=Fern+Melder", self.w.presence_query(), "a bare first part is no one to whisper: the configured officer stays")
        self.assertIn("addon=0.6.1", self.w.presence_query(), "the build still counts")
        self.assertEqual(self.w.state.d.get("relay_refused"), "Fern", "and the refusal is logged once, not at every read")
        # an 0.6.2 save carries the GUID: the roster in the same file names the character
        sv.write_text('OlympusVerifyDB = { ["addonVersion"] = "0.6.2", ["lastCharacter"] = "Alt Fern", '
                      '["lastCharacterGuid"] = "Player-4613-00AB12CD", %s, ["events"] = {} }\n' % roster, encoding="utf-8")
        os.utime(sv, (time.time() + 4, time.time() + 4))
        self.w.check_savedvars()
        self.assertIn("relay=Alt+Fern", self.w.presence_query())
        self.assertIn("addon=0.6.2", self.w.presence_query())
        # a GUID the roster does not list names nobody: the character stays as it was
        sv.write_text('OlympusVerifyDB = { ["addonVersion"] = "0.6.2", ["lastCharacter"] = "Ghost Gil", '
                      '["lastCharacterGuid"] = "Player-4613-0DEAD000", %s, ["events"] = {} }\n' % roster, encoding="utf-8")
        os.utime(sv, (time.time() + 6, time.time() + 6))
        self.w.check_savedvars()
        self.assertIn("relay=Alt+Fern", self.w.presence_query())
        self._start()
        mac = codes.relay_token("olympus-test-secret", "Main Fern", "0.6.1", self._day())
        with open(self.log, "a", encoding="utf-8") as f:
            f.write(f"{_stamp(datetime.fromtimestamp(time.time() + 60))}  To Main Fern: Olympus: relay Main Fern is in the world (addon 0.6.1, ref OLVr-{mac})\n")
        self.w.tail_chat_log()
        self.assertIn("relay=Main+Fern", self.w.presence_query(), "a login note read later wins")

    def test_a_login_note_counts_only_when_addressed_to_the_name_it_carries(self):
        client = self.wow / "Logs" / "Client.log"
        client.write_text("9/27 10:00:00.000  Active Player Created\n", encoding="utf-8")
        self._start()
        first = codes.relay_token("olympus-test-secret", "Fern", "0.6.2", self._day())
        whole = codes.relay_token("olympus-test-secret", "Fern Melder", "0.6.2", self._day())
        self._append(f"{_stamp()}  To Other Olga: Olympus: relay Fern Melder is in the world (addon 0.6.2, ref OLVr-{whole})",
                     f"{_stamp()}  To Fern Melder: Olympus: relay Fern is in the world (addon 0.6.2, ref OLVr-{first})")
        self.assertEqual(self.w.state.d.get("relay") or {}, {}, "sent to someone else, or naming a first part the server does not know: nothing")
        self._append(f"{_stamp()}  To Fern Melder: Olympus: relay Fern Melder is in the world (addon 0.6.2, ref OLVr-{whole})")
        self.assertEqual(self.w.state.d["relay"]["character"], "Fern Melder")
        self.assertIn("addon=0.6.2", self.w.presence_query())

    def test_a_name_kept_by_watcher_061_is_not_named_to_applicants(self):
        client = self.wow / "Logs" / "Client.log"
        client.write_text("9/27 10:00:00.000  Active Player Created\n", encoding="utf-8")
        # what watcher 0.6.1 stored from an 0.6.1 SavedVariables file: UnitName's first part
        self.w.state.d["relay"] = {"character": "Fern", "addon": "0.6.1", "at": int(time.time()), "from": "savedvariables"}
        self.assertIn("relay=Fern+Melder", self.w.presence_query(), "an unchecked name is not named; the configured officer is")
        sv = self.wow / "WTF" / "Account" / "ACC" / "SavedVariables" / "OlympusVerify.lua"
        sv.write_text('OlympusVerifyDB = { ["addonVersion"] = "0.6.1", ["lastCharacter"] = "Fern", ["events"] = {} }\n', encoding="utf-8")
        os.utime(sv, (time.time() + 2, time.time() + 2))
        self.w.check_savedvars()
        self.assertEqual(self.w.state.d["relay"]["character"], "", "and it is not carried over either")
        self.assertIn("relay=Fern+Melder", self.w.presence_query())

    def test_a_login_note_older_than_what_is_known_changes_nothing(self):
        self._start()
        self.w.state.d["relay"] = {"character": "Main Fern", "addon": "0.6.2", "at": int(time.time()) + 3600, "from": "roster"}
        mac = codes.relay_token("olympus-test-secret", "Alt Fern", "0.6.2", self._day())
        self._append(f"{_stamp()}  To Alt Fern: Olympus: relay Alt Fern is in the world (addon 0.6.2, ref OLVr-{mac})")
        self.assertEqual(self.w.state.d["relay"]["character"], "Main Fern", "a note the client wrote out late does not undo a newer save")

    def test_open_request_codes_reach_the_queue_file(self):
        body = watcher.Watcher.render_queue([], False, {"snapshotAt": 1, "graceDays": 3, "verifyOpenSince": 1, "firstSeenAvailable": True,
                                                         "openTickets": 4, "ranks": [], "members": []})
        self.assertIn("openTickets = 4,", body)


class GuildSiteTests(unittest.TestCase):
    """Worker .41 / addon 0.6.4: reserved names at the top of the queue, and the verified list with Discord names for
    the officers' roster window. Both ride in OlympusQueue.lua; an older Worker sends neither and nothing breaks."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        wow = Path(self.tmp.name)
        (wow / "Logs").mkdir()
        (wow / "WTF" / "Account" / "ACC" / "SavedVariables").mkdir(parents=True)
        (wow / "Interface" / "AddOns" / "OlympusVerify").mkdir(parents=True)
        self.w = watcher.Watcher({
            "worker_url": "https://example.invalid", "watcher_token": "t", "verify_secret": "olympus-test-secret",
            "wow_dir": str(wow), "account": "ACC", "officer_character": "Fern Melder", "state_file": str(wow / "state.json"),
        })

    def tearDown(self):
        self.tmp.cleanup()

    def _lua(self, body: str, expr: str) -> str:
        """Load the generated file in a real Lua 5.1 and print one expression, when a Lua is installed."""
        import shutil
        import subprocess
        lua = shutil.which("lua5.1") or shutil.which("lua")
        if not lua:
            self.skipTest("no Lua interpreter")
        f = Path(self.tmp.name) / "q.lua"
        f.write_text(body + f"\nprint({expr})\n", encoding="utf-8")
        out = subprocess.run([lua, str(f)], capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stderr)
        return out.stdout.strip()

    def test_priority_is_written_per_entry(self):
        body = watcher.Watcher.render_queue([
            {"id": 3, "character": "Carol Light", "discordId": "1", "position": 1, "priority": 1},
            {"id": 1, "character": "Early Bird", "discordId": "2", "position": 2},
            {"id": 2, "character": "Odd One", "discordId": "3", "position": 3, "priority": "x"},
        ], False)
        self.assertIn('character = "Carol Light", discordId = "1", note = "", position = 1, lastReason = "", priority = 1 }', body)
        self.assertIn('character = "Early Bird", discordId = "2", note = "", position = 2, lastReason = "", priority = 0 }', body, "an older Worker sends none: 0")
        self.assertIn('character = "Odd One", discordId = "3", note = "", position = 3, lastReason = "", priority = 0 }', body, "junk reads as 0")
        self.assertEqual(self._lua(body, "OlympusQueue.entries[1].priority, OlympusQueue.entries[2].priority"), "1\t0")

    def test_verified_list_reaches_the_queue_file(self):
        unv = {"snapshotAt": 1, "graceDays": 3, "verifyOpenSince": 1, "firstSeenAvailable": True, "openTickets": 0, "ranks": [], "members": [],
               "verified": [{"name": "Grace Hope", "guid": "Player-4613-005A70D8", "status": "member", "discordId": "300000000000000007",
                             "username": "grace_new", "displayName": 'Grace "the" Bold'},
                            {"name": "Ðismas Ðanero", "guid": None, "status": "verified", "discordId": "300000000000000008", "username": None, "displayName": None}]}
        body = watcher.Watcher.render_queue([], False, unv)
        self.assertIn("  verified = {", body)
        self.assertEqual(self._lua(body, "#OlympusQueue.verified.members, OlympusQueue.verified.members[1].displayName, OlympusQueue.verified.members[2].username == ''"),
                         'Grace "the" Bold'.join(["2\t", "\ttrue"]))

    def test_no_verified_key_from_an_older_worker_writes_no_section(self):
        body = watcher.Watcher.render_queue([], False, {"snapshotAt": 1, "graceDays": 3, "verifyOpenSince": 1, "firstSeenAvailable": True,
                                                         "openTickets": 0, "ranks": [], "members": []})
        self.assertNotIn("\n  verified = {", body)

    def test_pull_unverified_keeps_the_verified_list(self):
        res = {"build": "2026-09-29.41 guild-site", "snapshot": {"exportedAt": 5}, "graceDays": 3, "verifyOpenSince": 1, "firstSeenAvailable": True,
               "openTickets": 0, "ranks": [], "members": [{"name": "Nobody Here", "rank": "Initiate", "rankIndex": 6}],
               "verified": [{"name": "Grace Hope", "guid": "Player-1-2", "status": "member", "discordId": "7", "username": "grace", "displayName": None, "extra": "dropped"}]}
        self.w.worker.call = lambda method, path, body=None, retries=3: (True, res)  # type: ignore[method-assign]
        self.w.pull_unverified()
        self.assertEqual(self.w._unverified["verified"], [{"name": "Grace Hope", "guid": "Player-1-2", "status": "member", "discordId": "7", "username": "grace", "displayName": None}])
        self.assertIn("verified", json.dumps(self.w._unverified), "the list is part of the queue-file hash input, so a change rewrites the file")


class TransportTests(unittest.TestCase):
    """0.6.5 (1 Oct 2026): the Worker client ported from Olympus Forever's watcher (consolidation A14 / P-25). The origin
    must be a bare HTTPS origin; redirects are refused; 401/403/429 pause every request and the pause is kept in the
    state file; a redirect is a configuration error; a non-JSON answer is not a delivery; no response body is logged."""

    URL = "https://example.invalid"

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        wow = Path(self.tmp.name)
        (wow / "Logs").mkdir()
        (wow / "WTF" / "Account" / "ACC" / "SavedVariables").mkdir(parents=True)
        (wow / "Interface" / "AddOns" / "OlympusVerify").mkdir(parents=True)
        self.cfg = {"worker_url": self.URL, "watcher_token": "NEVER_LOG_TOKEN", "verify_secret": "olympus-test-secret", "wow_dir": str(wow),
                    "account": "ACC", "officer_character": "Fern Melder", "state_file": str(wow / "state.json")}
        self.out = io.StringIO()

    def tearDown(self):
        self.tmp.cleanup()

    def logs(self):
        return self.out.getvalue()

    @staticmethod
    def _http_error(code, headers=None, body=b"NEVER_LOG_SECRET"):
        return urllib.error.HTTPError(TransportTests.URL + "/x", code, "fixture", headers if headers is not None else Message(), io.BytesIO(body))

    def test_the_origin_must_be_a_bare_https_origin(self):
        for url in ("http://example.invalid", "//example.invalid", "https://" + "user:secret@" + "example.invalid", "https://example.invalid/path",  # userinfo, built from parts so no line carries a credential-shaped URL literal (the publication audit)
                    "https://example.invalid?token=x", "https://example.invalid/#x", "https://example.invalid:bad", "https://example.invalid\n", None):
            with self.subTest(url=url), patch.object(urllib.request.OpenerDirector, "open") as transport:
                with self.assertRaisesRegex(ValueError, "HTTPS origin"):
                    watcher.Worker(url, "NEVER_LOG_TOKEN")
                transport.assert_not_called()
        self.assertEqual(watcher.Worker("https://example.invalid/", "t").base, "https://example.invalid", "a trailing slash is the same origin")

    def test_a_redirect_is_refused_and_reported_as_a_configuration_error(self):
        for status in (301, 302, 303, 307, 308):
            calls = []

            class FixtureHTTPS(urllib.request.HTTPSHandler):
                def https_open(self, request):
                    calls.append((request.full_url, request.method, request.get_header("Authorization")))
                    headers = Message()
                    headers["Location"] = "https://different.invalid/collect"
                    response = urllib.response.addinfourl(io.BytesIO(b"PRIVATE_BODY"), headers, request.full_url, status)
                    response.msg = "fixture redirect"
                    return response

            worker = watcher.Worker(self.URL, "NEVER_LOG_TOKEN")
            worker.opener = urllib.request.build_opener(watcher.NoRedirect(), FixtureHTTPS())
            with self.subTest(status=status), contextlib.redirect_stdout(self.out):
                ok, result = worker.call("POST", "/ingest/events", {"private": "body"}, retries=1)
                self.assertFalse(ok)
                self.assertTrue(result["configurationError"])
                self.assertEqual(result["httpStatus"], status)
                self.assertEqual(calls, [(self.URL + "/ingest/events", "POST", "Bearer NEVER_LOG_TOKEN")], "the bearer went to the origin once and nowhere else")
                self.assertIs(worker.call("GET", "/queue", retries=1)[1]["paused"], True)
                self.assertEqual(len(calls), 1, "and the pause stops the next request before transport")
        self.assertNotIn("NEVER_LOG_TOKEN", self.logs())
        self.assertNotIn("PRIVATE_BODY", self.logs())
        self.assertIn("redirect refused", self.logs())

    def test_a_denied_token_pauses_everything_and_the_pause_survives_a_restart(self):
        w = watcher.Watcher(self.cfg)
        with patch.object(urllib.request.OpenerDirector, "open", side_effect=self._http_error(403)) as transport, contextlib.redirect_stdout(self.out):
            ok, res = w.worker.call("POST", "/ingest/events", {"events": []}, retries=3)
            self.assertFalse(ok)
            self.assertEqual(res["httpStatus"], 403)
            self.assertGreaterEqual(res["retryAfterSeconds"], 899)
            self.assertIs(w.worker.call("GET", "/queue", retries=1)[1].get("paused"), True)
            restarted = watcher.Watcher(self.cfg)
            self.assertIs(restarted.worker.call("GET", "/queue/unverified", retries=1)[1].get("paused"), True)
        self.assertEqual(transport.call_count, 1, "one request hit the wire; a 403 is not retried and nothing follows it")
        saved = json.loads(Path(self.cfg["state_file"]).read_text(encoding="utf-8"))
        self.assertEqual(saved["worker_retry_status"], 403)
        self.assertGreaterEqual(saved["worker_retry_at"], time.time() + 890)
        self.assertNotIn("NEVER_LOG_SECRET", self.logs())
        self.assertNotIn("NEVER_LOG_TOKEN", self.logs())
        self.assertEqual(self.logs().count("check watcher_token"), 1, "said once, not on every poll")

    def test_a_rate_limit_honours_retry_after(self):
        worker = watcher.Worker(self.URL, "NEVER_LOG_TOKEN")
        headers = Message()
        headers["Retry-After"] = "200000"
        with patch.object(urllib.request.OpenerDirector, "open", side_effect=self._http_error(429, headers)), contextlib.redirect_stdout(self.out):
            ok, result = worker.call("GET", "/queue", retries=3)
        self.assertFalse(ok)
        self.assertEqual(result["httpStatus"], 429)
        self.assertGreaterEqual(result["retryAfterSeconds"], 200000)
        self.assertNotIn("NEVER_LOG_SECRET", self.logs())
        self.assertEqual(watcher.Worker._retry_after({"Retry-After": "200000.5"}), 200001)
        self.assertGreater(watcher.Worker._retry_after({"Retry-After": "Fri, 15 Jan 2027 08:00:00 GMT"}), 0)
        self.assertEqual(watcher.Worker._retry_after({"Retry-After": "Fri, 15 Jan 2021 08:00:00 GMT"}), 0, "a past date is now")
        self.assertEqual(watcher.Worker._retry_after({"Retry-After": "not a date"}), 0)
        self.assertEqual(watcher.Worker._retry_after(None), 0)

    def test_a_success_ends_the_pause_record(self):
        worker = watcher.Worker(self.URL, "NEVER_LOG_TOKEN")
        with patch.object(urllib.request.OpenerDirector, "open", side_effect=self._http_error(401)), contextlib.redirect_stdout(self.out):
            worker.call("GET", "/queue", retries=1)
        self.assertEqual(worker._pause["worker_retry_status"], 401)
        worker._pause["worker_retry_at"] = 0  # the pause has lapsed
        with patch.object(urllib.request.OpenerDirector, "open", return_value=io.BytesIO(b'{"entries": []}')), contextlib.redirect_stdout(self.out):
            ok, result = worker.call("GET", "/queue", retries=1)
        self.assertTrue(ok)
        self.assertEqual(result, {"entries": []})
        self.assertIsNone(worker._pause["worker_retry_status"])

    def test_a_response_that_is_not_json_is_not_a_delivery(self):
        worker = watcher.Worker(self.URL, "NEVER_LOG_TOKEN")
        for body in (b"NEVER_LOG_SECRET", b"private-fixture-note\xff"):
            with self.subTest(body=body), patch.object(urllib.request.OpenerDirector, "open", return_value=io.BytesIO(body)), contextlib.redirect_stdout(self.out):
                ok, result = worker.call("POST", "/ingest/events", {}, retries=1)
                self.assertFalse(ok)
                self.assertEqual(result, "invalid_response")
        self.assertNotIn("NEVER_LOG_SECRET", self.logs())
        self.assertNotIn("private-fixture", self.logs())

    def test_other_4xx_and_5xx_keep_their_meaning_without_a_body_in_the_log(self):
        worker = watcher.Worker(self.URL, "NEVER_LOG_TOKEN")
        with patch.object(urllib.request.OpenerDirector, "open", side_effect=self._http_error(400)), contextlib.redirect_stdout(self.out):
            self.assertEqual(worker.call("POST", "/ingest/verify", {}, retries=3), (True, None), "a 400 is the Worker's answer: understood and rejected, not retried")
        with patch.object(urllib.request.OpenerDirector, "open", side_effect=self._http_error(503)) as transport, patch.object(watcher.time, "sleep"), contextlib.redirect_stdout(self.out):
            self.assertEqual(worker.call("GET", "/queue", retries=3), (False, "unreachable"))
        self.assertEqual(transport.call_count, 3, "a 5xx is retried")
        self.assertIsNone(worker.paused(), "and does not pause: the next poll tries again")
        self.assertNotIn("NEVER_LOG_SECRET", self.logs())

    def test_check_reports_a_pause_and_main_refuses_a_bad_origin(self):
        w = watcher.Watcher(self.cfg)
        w.state.d["worker_retry_at"] = time.time() + 600
        w.state.d["worker_retry_status"] = 401
        with patch.object(urllib.request.OpenerDirector, "open") as transport, contextlib.redirect_stdout(self.out):
            self.assertEqual(w.check(), 1)
        transport.assert_not_called()
        self.assertIn("PAUSED", self.logs())
        self.assertIn("check watcher_token", self.logs())
        cfg_path = Path(self.cfg["wow_dir"]) / "cfg.json"
        cfg_path.write_text(json.dumps({**self.cfg, "worker_url": "http://example.invalid"}), encoding="utf-8")
        with patch.object(sys, "argv", ["watcher.py", "--config", str(cfg_path), "--check"]), contextlib.redirect_stdout(self.out):
            self.assertEqual(watcher.main(), 2, "an http:// worker_url is refused before any request")
        self.assertIn("HTTPS origin", self.logs())

    def test_an_empty_or_non_object_2xx_is_not_a_delivery(self):
        """0.6.6 (Codex's review of 0.6.5, 03:07): an empty 2xx was (True, None) and post() dropped the event as delivered."""
        worker = watcher.Worker(self.URL, "NEVER_LOG_TOKEN")
        for body in (b"", b"   ", b"[]", b'"ok"', b"42"):
            with self.subTest(body=body), patch.object(urllib.request.OpenerDirector, "open", return_value=io.BytesIO(body)), contextlib.redirect_stdout(self.out):
                ok, result = worker.call("POST", "/ingest/events", {"events": []}, retries=1)
                self.assertFalse(ok)
                self.assertEqual(result, "invalid_response")
        with patch.object(urllib.request.OpenerDirector, "open", return_value=io.BytesIO(b'{"applied": 1}')), contextlib.redirect_stdout(self.out):
            self.assertEqual(worker.call("POST", "/ingest/events", {"events": []}, retries=1), (True, {"applied": 1}))
        w = watcher.Watcher(self.cfg)
        w.worker.call = lambda *a, **k: (False, "invalid_response")  # type: ignore[method-assign]
        with contextlib.redirect_stdout(self.out):
            self.assertFalse(w.post("/ingest/events", {"events": [{"private": "NEVER_LOG_EVENT"}]}, "events"))
        self.assertEqual(len(w.state.d["outbox"]), 1, "an unacknowledged post is buffered, never dropped")
        self.assertNotIn("NEVER_LOG_EVENT", self.logs())

    def test_a_non_finite_retry_after_is_invalid_and_long_finite_ones_stand(self):
        for value in ("inf", "-inf", "nan", "1e400", "Infinity"):
            with self.subTest(value=value):
                self.assertEqual(watcher.Worker._retry_after({"Retry-After": value}), 0)
        self.assertEqual(watcher.Worker._retry_after({"Retry-After": "31536000"}), 31536000, "a long finite deadline is kept")

    def test_the_bearer_goes_only_to_a_local_absolute_path(self):
        worker = watcher.Worker(self.URL, "NEVER_LOG_TOKEN")
        for path in ("queue", "//evil.invalid/queue", "https://evil.invalid/queue", "/queue\n", "", None):
            with self.subTest(path=path), patch.object(urllib.request.OpenerDirector, "open") as transport, contextlib.redirect_stdout(self.out):
                self.assertEqual(worker.call("GET", path, retries=1), (False, "invalid_path"))
                transport.assert_not_called()
        self.assertNotIn("evil.invalid", self.logs())
        self.assertNotIn("NEVER_LOG_TOKEN", self.logs())

    def test_logs_carry_summaries_never_response_text(self):
        worker = watcher.Worker(self.URL, "NEVER_LOG_TOKEN")
        with patch.object(urllib.request.OpenerDirector, "open", side_effect=http.client.IncompleteRead(b"PRIVATE_PARTIAL_BODY", 30)), patch.object(watcher.time, "sleep"), contextlib.redirect_stdout(self.out):
            self.assertEqual(worker.call("GET", "/queue", retries=2), (False, "unreachable"))
        self.assertIn("IncompleteRead", self.logs())
        self.assertNotIn("PRIVATE_PARTIAL_BODY", self.logs())
        w = watcher.Watcher(self.cfg)
        w.worker.call = lambda *a, **k: (True, {"result": "verified", "note": "NEVER_LOG_FIELD", "character": "NEVER_LOG_NAME"})  # type: ignore[method-assign]
        with contextlib.redirect_stdout(self.out):
            self.assertTrue(w.post("/ingest/verify", {"character": "X", "code": "Y"}, "verify"))
        self.assertIn("delivered (verified)", self.logs())
        self.assertNotIn("NEVER_LOG_FIELD", self.logs())
        self.assertNotIn("NEVER_LOG_NAME", self.logs())
        w.worker.call = lambda *a, **k: (True, {"result": "NEVER_LOG_UNKNOWN_WORD"})  # type: ignore[method-assign]
        with contextlib.redirect_stdout(self.out):
            w.post("/ingest/verify", {}, "verify")
        self.assertNotIn("NEVER_LOG_UNKNOWN_WORD", self.logs(), "an unknown result word is not a known summary")


if __name__ == "__main__":
    unittest.main()

"""Blizzard's Discord guild-chat bridge (patch 12.1 code, present in the Forever client) relays Discord users' text into
guild chat, and so into WoWChatLog.txt. Nothing a Discord user types may be read as a guild system line, a whisper,
or a trusted join token. Run from the watcher folder:  python tests/test_discord_relay.py"""
import importlib.util, pathlib, sys
here = pathlib.Path(__file__).resolve().parent.parent
sys.argv = ["watcher.py"]
spec = importlib.util.spec_from_file_location("w", here / "watcher.py"); w = importlib.util.module_from_spec(spec); spec.loader.exec_module(w)

def parse(line):
    hits = []
    m = w.SYSTEM_RE.match(line)
    if m:
        for label, rx in (("JOIN", w.GUILD_JOIN_RE), ("LEAVE", w.GUILD_LEAVE_RE), ("KICK", w.GUILD_KICK_RE)):
            if rx.match(m.group("text")): hits.append(label)
    wm = w.WHISPER_RE.match(line)
    if wm: hits.append("WHISPER:" + wm.group("sender"))
    om = w.OUT_WHISPER_RE.match(line)
    if om and w.JOIN_TOKEN_RE.search(om.group("text")): hits.append("TOKEN")
    return hits

S = "9/25 20:00:00.000  "
genuine = {
    S + "Tater Toe has joined the guild.": ["JOIN"],
    S + "Tater Toe has been kicked out of the guild by Fern Melder.": ["KICK"],
    S + "Tater Toe whispers: !verify ABC123": ["WHISPER:Tater Toe"],
    S + "Tater-Forever whispers: !verify ABC123": ["WHISPER:Tater-Forever"],
    S + "To Tater Toe: Olympus: welcome (ref OLVj-0123456789)": ["TOKEN"],
    S + "To Fern Melder: Olympus: Tater Toe joined the guild (ref OLVj-0123456789)": ["TOKEN"],
}
relayed = [
    "[Guild] Troll: Tater Toe has left the guild.",
    "[Guild] [Discord] Troll: Tater Toe has left the guild.",
    "[Discord] Troll: Tater Toe has been kicked out of the guild by Fern Melder.",
    "|TInterface\\Discord:14|t Troll: Tater Toe has joined the guild.",
    "[Guild] Troll: To Tater Toe: (ref OLVj-0123456789)",
    "[Guild] Troll: To Fern Melder: Olympus: Tater Toe joined the guild (ref OLVj-0123456789)",
    "[Guild] Troll: Tater Toe whispers: !verify ABC123",
    "[Guild] Tater Toe whispers: !verify ABC123",           # Discord display name chosen as "Tater Toe whispers"
    "|TInterface\\Discord:14|t Tater Toe whispers: !verify ABC123",
    "|Kq12|k whispers: !verify ABC123",                   # a Battle.net whisper is not a character whisper
]
fails = 0
for line, want in genuine.items():
    got = parse(line); fails += got != want
    print(("PASS" if got == want else "FAIL"), "genuine", got)
for text in relayed:
    got = parse(S + text); fails += bool(got)
    print(("PASS" if not got else "FAIL"), "relayed ->", got or "ignored", "::", text[:60])
print(f"{len(genuine) + len(relayed) - fails}/{len(genuine) + len(relayed)} passed")
sys.exit(1 if fails else 0)

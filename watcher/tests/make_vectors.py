"""Generate cross-language HMAC code vectors (run from watcher/): python tests/make_vectors.py > tests/vectors.json"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import codes
cases = [
    ("olympus-test-secret", "Thrall", "2026-09-17"),
    ("olympus-test-secret", "thrall", "2026-09-17"),
    ("olympus-test-secret", "  Thrall-Realm ", "2026-09-17"),
    ("olympus-test-secret", "Thrall", "2026-09-18"),
    ("olympus-test-secret", "Aelin Stormwarden", "2026-09-17"),
    ("olympus-test-secret", "Aelin  Stormwarden", "2026-09-17"),
    ("another secret with spaces and ü", "Fernmelder", "2026-11-04"),
    ("x", "A'thar", "2027-01-01"),
    # Non-ASCII character NAMES: the three normalizeCharacter implementations take different routes (Python and
    # TypeScript iterate code points, Lua lowercases raw UTF-8 bytes in the C locale). Only ASCII A-Z may change,
    # so these must come out byte-identical everywhere — that is the property worth pinning.
    ("olympus-test-secret", "Zoë", "2026-09-17"),
    ("olympus-test-secret", "Ünver Kaya", "2026-09-17"),
    ("olympus-test-secret", "Ünver Kaya", "2026-09-18"),
    ("olympus-test-secret", "Müller-Realm", "2026-09-17"),
]
# Request codes and signed departures (27 Sep 2026): one fixed nonce and one departure kind per case, kept flat so
# the Lua harness's simple object matcher still reads every field.
NONCES = ["K7Q", "ABC", "ZZ9", "2M4", "HJK", "Q3R", "WXY", "8N5", "PPP", "D2F", "T6V", "E9G"]
# The addon's login note (relay tokens) and the one rule for what a whispered token may be (strict codes).
RELAY_VERSIONS = ["0.6.0", "0.6.1", "1.0.0-beta", "0.10.2"]
STRICT = ["k7qystg", "K7QYSTG1", "0K7QYST", "ABCDEF", "abcde", "ABCDEFGH", "3fYwNz", " 3FYWNZ", "IOIOIO", "2345678", "K7QYST0", "ZZZZZZZ"]
out = [
    {
        "secret": s,
        "character": c,
        "day": d,
        "normalized": codes.normalize_character(c),
        "code": codes.code_for(s, c, d),
        "joinToken": codes.join_token(s, c, d),
        "nonce": NONCES[i % len(NONCES)],
        "ticket": codes.ticket_for(s, NONCES[i % len(NONCES)], d),
        "leaveKind": codes.LEAVE_KINDS[i % len(codes.LEAVE_KINDS)],
        "leaveToken": codes.leave_token(s, codes.LEAVE_KINDS[i % len(codes.LEAVE_KINDS)], c, d),
        "relayVersion": RELAY_VERSIONS[i % len(RELAY_VERSIONS)],
        "relayToken": codes.relay_token(s, c, RELAY_VERSIONS[i % len(RELAY_VERSIONS)], d),
        "guid": f"Player-{4613 + i}-{(0x0ABCDEF0 + i):08X}",
        "guidToken": codes.guid_token(s, c, f"Player-{4613 + i}-{(0x0ABCDEF0 + i):08X}", d),
        "strictIn": STRICT[i % len(STRICT)],
        "strictOut": codes.strict_code(STRICT[i % len(STRICT)]) or "",
    }
    for i, (s, c, d) in enumerate(cases)
]
print(json.dumps(out, indent=2, ensure_ascii=False))

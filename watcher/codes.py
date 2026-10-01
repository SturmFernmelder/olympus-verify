"""Verification codes — Python implementation of the shared spec (see worker/src/codes.ts).

    message = ascii_lower(strip(character)) + "|" + day_bucket_utc        e.g. "thrall|2026-09-17"
    digest  = HMAC-SHA256(secret, message)
    code    = first 30 bits of digest as 6 symbols of ABCDEFGHJKLMNPQRSTUVWXYZ23456789

Accepted for the issue day and the following UTC day.

Request codes ("tickets", 27 Sep 2026) — 7 symbols, bound to the Discord request rather than a character:

    ticket = nonce (3 symbols, random, chosen by the Worker) + first 4 symbols of
             digest_to_code(HMAC-SHA256(secret, "ticket|" + nonce + "|" + day_bucket_utc))

A 6-symbol code is always a character code and a 7-symbol code always a ticket.
"""
from __future__ import annotations

import hashlib
import hmac
import re
from datetime import datetime, timedelta, timezone

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 6
TICKET_LENGTH = 7
TICKET_NONCE_LENGTH = 3


def normalize_character(name: str) -> str:
    """ASCII-only lowercase, whitespace collapsed, realm suffix removed. Identical to TS and Lua."""
    s = re.sub(r"\s+", " ", name.strip())
    dash = s.find("-")
    if dash > 0:
        s = s[:dash]
    return "".join(chr(ord(c) + 32) if "A" <= c <= "Z" else c for c in s)


def day_bucket(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d")


def digest_to_code(digest: bytes) -> str:
    bits = int.from_bytes(digest[:4], "big")
    return "".join(ALPHABET[(bits >> (32 - 5 * (i + 1))) & 31] for i in range(CODE_LENGTH))


def code_for(secret: str, character: str, day: str) -> str:
    msg = f"{normalize_character(character)}|{day}".encode("utf-8")
    return digest_to_code(hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).digest())


def valid_codes(secret: str, character: str, now: datetime | None = None) -> list[str]:
    now = now or datetime.now(timezone.utc)
    return [code_for(secret, character, day_bucket(now)), code_for(secret, character, day_bucket(now - timedelta(days=1)))]


def normalize_code_input(s: str) -> str:
    return re.sub(r"[^A-Z2-9]", "", s.strip().upper())


def is_valid_code(secret: str, character: str, code: str, now: datetime | None = None) -> bool:
    c = normalize_code_input(code)
    return len(c) == CODE_LENGTH and c in valid_codes(secret, character, now)


def join_token(secret: str, character: str, day: str) -> str:
    """Marker the addon appends to its join-confirmation whisper so the watcher can tell a real guild join from a
    player typing "/e has joined the guild." into the chat log. The chat log records outgoing whispers verbatim, so
    the addon can sign a line it emits; the text of a system message carries no such proof.

        token = HMAC-SHA256(VERIFY_SECRET, "joined|" + asciiLower(character) + "|" + utcDay)  -> first 10 hex chars

    Mirrored in addon/OlympusVerify/OlympusHmac.lua (L.joinToken).
    """
    msg = f"joined|{normalize_character(character)}|{day}"
    return hmac.new(secret.encode("utf-8"), msg.encode("utf-8"), hashlib.sha256).hexdigest()[:10]


def valid_join_tokens(secret: str, character: str, now: datetime | None = None) -> list[str]:
    now = now or datetime.now(timezone.utc)
    return [join_token(secret, character, day_bucket(now)), join_token(secret, character, day_bucket(now - timedelta(days=1)))]


# ---------- request codes (tickets) ----------

def ticket_for(secret: str, nonce: str, day: str) -> str:
    n = normalize_code_input(nonce)[:TICKET_NONCE_LENGTH]
    mac = digest_to_code(hmac.new(secret.encode("utf-8"), f"ticket|{n}|{day}".encode("utf-8"), hashlib.sha256).digest())
    return n + mac[: TICKET_LENGTH - TICKET_NONCE_LENGTH]


def is_valid_ticket(secret: str, code: str, now: datetime | None = None) -> bool:
    c = normalize_code_input(code)
    if len(c) != TICKET_LENGTH:
        return False
    now = now or datetime.now(timezone.utc)
    nonce = c[:TICKET_NONCE_LENGTH]
    return c in (ticket_for(secret, nonce, day_bucket(now)), ticket_for(secret, nonce, day_bucket(now - timedelta(days=1))))


def strict_code(token: str) -> str | None:
    """The code in a `!verify` whisper, or None. The token must be exactly 6 or 7 symbols from A-Z and 2-9 (either case):
    nothing is stripped, so "K7QYADR1" or "0K7QYADR" is refused rather than trimmed into a valid code. The addon applies
    the same rule (OlympusHmac.strictCode), so the two never disagree about what was whispered."""
    if not token or not token.isascii():  # "ſ".upper() is "S": only ASCII may be folded, as in Lua's C locale
        return None
    c = token.upper()
    return c if re.fullmatch(r"[A-Z2-9]{6,7}", c) else None


def code_kind(secret: str, character: str, code: str, now: datetime | None = None) -> str | None:
    """"character" or "ticket" for a code valid right now, else None. The length says which spec applies."""
    c = normalize_code_input(code)
    if len(c) == CODE_LENGTH:
        return "character" if is_valid_code(secret, character, c, now) else None
    if len(c) == TICKET_LENGTH:
        return "ticket" if is_valid_ticket(secret, c, now) else None
    return None


# ---------- signed departures ----------

LEAVE_KINDS = ("left", "kicked", "space", "unverified")


def leave_token(secret: str, kind: str, character: str, day: str) -> str:
    """Marker the addon appends to its note-to-self when a guild system line says someone left or was removed.
    CHAT_MSG_SYSTEM cannot be forged from another client (an /emote arrives as CHAT_MSG_EMOTE), but the chat-log copy
    of the text can, so the note carries proof the same way a join does. The kind is inside the MAC.

        token = HMAC-SHA256(VERIFY_SECRET, "left|" + kind + "|" + asciiLower(character) + "|" + utcDay) -> first 10 hex

    Mirrored in addon/OlympusVerify/Libs/OlympusHmac.lua (L.leaveToken).
    """
    msg = f"left|{kind}|{normalize_character(character)}|{day}"
    return hmac.new(secret.encode("utf-8"), msg.encode("utf-8"), hashlib.sha256).hexdigest()[:10]


def valid_leave_tokens(secret: str, kind: str, character: str, now: datetime | None = None) -> list[str]:
    now = now or datetime.now(timezone.utc)
    return [leave_token(secret, kind, character, day_bucket(now)), leave_token(secret, kind, character, day_bucket(now - timedelta(days=1)))]


# ---------- relay notes ----------

def relay_token(secret: str, character: str, version: str, day: str) -> str:
    """Marker on the addon's note-to-self at every login and reload: "Olympus: relay <Name> is in the world (addon
    <version>, ref OLVr-...)". It tells the watcher which character the officer is playing (so /verify names that one)
    and which addon build is loaded (so the Worker hands out request codes only once it understands them).

        token = HMAC-SHA256(VERIFY_SECRET, "relay|" + asciiLower(character) + "|" + version + "|" + utcDay) -> first 10 hex

    Mirrored in addon/OlympusVerify/Libs/OlympusHmac.lua (L.relayToken).
    """
    msg = f"relay|{normalize_character(character)}|{version}|{day}"
    return hmac.new(secret.encode("utf-8"), msg.encode("utf-8"), hashlib.sha256).hexdigest()[:10]


def valid_relay_tokens(secret: str, character: str, version: str, now: datetime | None = None) -> list[str]:
    now = now or datetime.now(timezone.utc)
    return [relay_token(secret, character, version, day_bucket(now)), relay_token(secret, character, version, day_bucket(now - timedelta(days=1)))]


# ---------- the character behind a confirmed code ----------

def guid_token(secret: str, character: str, guid: str, day: str) -> str:
    """Marker on the addon's note naming the character (GUID) that whispered a valid code: "Olympus: <Name> is <GUID>
    (ref OLVg-...)". The server vouches for the whisper's sender GUID exactly as for its name; the chat log only has
    the name, so the addon writes the GUID where the watcher can read it.

        token = HMAC-SHA256(VERIFY_SECRET, "guid|" + asciiLower(character) + "|" + guid + "|" + utcDay) -> first 10 hex

    Mirrored in addon/OlympusVerify/Libs/OlympusHmac.lua (L.guidToken).
    """
    msg = f"guid|{normalize_character(character)}|{guid}|{day}"
    return hmac.new(secret.encode("utf-8"), msg.encode("utf-8"), hashlib.sha256).hexdigest()[:10]


def valid_guid_tokens(secret: str, character: str, guid: str, now: datetime | None = None) -> list[str]:
    now = now or datetime.now(timezone.utc)
    return [guid_token(secret, character, guid, day_bucket(now)), guid_token(secret, character, guid, day_bucket(now - timedelta(days=1)))]


GUID_RE = re.compile(r"^Player-\d{1,6}-[0-9A-Fa-f]{4,16}$")


def is_guid(value: object) -> bool:
    return isinstance(value, str) and bool(GUID_RE.match(value))

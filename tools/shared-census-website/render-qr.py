"""Fixed synthetic OLCS1 frames -> owned Lua QR matrices -> in-memory PNG/base64.

Reads one bounded JSON object from stdin. Writes only a JSON base64 array to stdout.
No game process, installs, temporary files, observations, network or shared storage.
"""
import base64
import hashlib
import json
from pathlib import Path
import re
import struct
import sys
import zlib

ENCODER_SHA256 = "d46985b002fef7923c03259d7de9df9c6e70af3c750f94c330aaa091ba6bb017"
FRAME = re.compile(r"OLCS1\|([a-f0-9]{32})\|([A-Za-z0-9_-]{43})\|([0-9]{3})\|([0-9]{3})\|([A-Za-z0-9_-]{1,100})", re.ASCII)


def reject_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate")
        result[key] = value
    return result


def load_json(value):
    return json.loads(value, object_pairs_hook=reject_duplicates,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError("constant")))


def decode64(value):
    decoded = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    if base64.urlsafe_b64encode(decoded).decode("ascii").rstrip("=") != value:
        raise ValueError("base64")
    return decoded


def chunk(kind, value):
    return struct.pack("!I", len(value)) + kind + value + struct.pack("!I", zlib.crc32(kind + value) & 0xffffffff)


def main():
    if len(sys.argv) != 1:
        raise ValueError("arguments")
    raw = sys.stdin.buffer.read(4097)
    if not raw or len(raw) > 4096:
        raise ValueError("size")
    request = load_json(raw.decode("utf-8", "strict"))
    if not isinstance(request, dict) or list(request) != ["frames"]:
        raise ValueError("shape")
    frames = request["frames"]
    if not isinstance(frames, list) or not 1 <= len(frames) <= 14:
        raise ValueError("parts")
    pieces, nonce, checksum = [], None, None
    for index, frame in enumerate(frames, 1):
        if not isinstance(frame, str) or len(frame) > 191:
            raise ValueError("frame")
        match = FRAME.fullmatch(frame)
        if not match or int(match[3]) != index or int(match[4]) != len(frames):
            raise ValueError("sequence")
        if nonce is not None and (match[1] != nonce or match[2] != checksum):
            raise ValueError("mixed")
        nonce, checksum = match[1], match[2]
        if len(decode64(checksum)) != 32 or index < len(frames) and len(match[5]) != 100:
            raise ValueError("framing")
        pieces.append(decode64(match[5]))
    body = b"".join(pieces)
    if len(body) > 1023 or base64.urlsafe_b64encode(hashlib.sha256(body).digest()).decode("ascii").rstrip("=") != checksum:
        raise ValueError("checksum")
    payload = load_json(body.decode("utf-8", "strict"))
    root_keys = ["format", "scope", "source", "sourceVerified", "membershipProof", "addonVersion", "realmGroup", "faction", "observedAt", "guilds"]
    row_keys = ["name", "receivedAt", "reportedCharacters", "online"]
    if not isinstance(payload, dict) or list(payload) != root_keys or payload["format"] != "olympus-stat-observation-v1" or payload["scope"] != "own-guild" or payload["source"] != "volunteer-client" or payload["sourceVerified"] is not False or payload["membershipProof"] is not False or payload["addonVersion"] != "0.1.0" or payload["realmGroup"] != "Synthetic Realm" or payload["faction"] != "Alliance" or type(payload["observedAt"]) is not int or not 0 <= payload["observedAt"] <= 253402300799:
        raise ValueError("synthetic contract")
    if not isinstance(payload["guilds"], list) or len(payload["guilds"]) != 1:
        raise ValueError("guild")
    row = payload["guilds"][0]
    if not isinstance(row, dict) or list(row) != row_keys or row["name"] not in ("Synthetic Oak", "Synthetic Pine") or type(row["receivedAt"]) is not int or row["receivedAt"] != payload["observedAt"] or (row["reportedCharacters"], row["online"]) not in ((240, 60), ("few", None), (240, None), (143, 67)):
        raise ValueError("synthetic row")
    if json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8") != body:
        raise ValueError("canonical")
    encoder_file = Path(__file__).resolve().parents[2] / "addon/OlympusStatsPilot/Libs/StatsPilotQr.lua"
    encoder = encoder_file.read_bytes()
    if hashlib.sha256(encoder).hexdigest() != ENCODER_SHA256:
        raise ValueError("source")
    import lupa.luajit21 as runtime
    lua = runtime.LuaRuntime(unpack_returned_tuples=True, encoding=None, register_eval=False, register_builtins=False)
    lua.execute(encoder)
    encode = lua.globals()[b"OlympusStatsPilotQr"][b"Encode"]
    images = []
    for frame in frames:
        matrix = encode(frame.encode("ascii"))
        if matrix is None or isinstance(matrix, tuple):
            raise ValueError("encoder")
        grid = [[bool(matrix[y][x]) for x in range(49)] for y in range(49)]
        rows = []
        for my in range(-4, 53):
            row_bytes = bytearray()
            for mx in range(-4, 53):
                value = 0 if 0 <= my < 49 and 0 <= mx < 49 and grid[my][mx] else 255
                row_bytes.extend(bytes((value, value, value, 255)) * 6)
            rows.extend([b"\0" + bytes(row_bytes)] * 6)
        png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack("!2I5B", 342, 342, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b"")
        if len(png) > 32768:
            raise ValueError("image size")
        images.append(base64.b64encode(png).decode("ascii"))
    answer = json.dumps(images, separators=(",", ":"))
    if len(answer) > 262144:
        raise ValueError("output")
    sys.stdout.write(answer)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.stderr.write("synthetic_qr_render_refused\n")
        sys.exit(1)

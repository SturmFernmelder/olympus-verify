"""Run actual Lua factories and independently verify their synthetic MAC vector."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import sys

from lupa.luajit21 import LuaRuntime

root = Path(__file__).resolve().parent
os.chdir(root)
runtime = LuaRuntime(unpack_returned_tuples=True)
runtime.execute((root / "test_tithe280.lua").read_text(encoding="utf-8"))
result = runtime.globals().TITHE280_RESULT
expected = hmac.new(result["secret"].encode(), result["message"].encode(), hashlib.sha256).hexdigest()[:32]
assert result["mac"] == expected, "independent Python/Lua semantic MAC vector"


def plain(value):
    return {key: plain(child) for key, child in value.items()} if hasattr(value, "items") else value


receipt = {
    "at": "synthetic-native-only",
    "luaChecks": result["checks"],
    "independentPythonMAC": "PASS",
    "vector": {key: plain(result[key]) for key in ("secret", "message", "mac", "receipt")},
    "scope": "Mocked native game APIs, actual Lua factories; no installed client, real gold, provider or live bridge.",
}
if len(sys.argv) == 2:
    Path(sys.argv[1]).write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"{result['checks']} Lua checks and independent Python MAC passed")

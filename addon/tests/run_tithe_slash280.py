"""Run the actual slash registry regression without a game client or real config."""
import json
import os
from pathlib import Path
import sys
from lupa.luajit21 import LuaRuntime

root = Path(__file__).resolve().parent
os.chdir(root)
runtime = LuaRuntime(unpack_returned_tuples=True)
error = None
try:
    runtime.execute((root / "test_tithe_slash280.lua").read_text(encoding="utf-8"))
except Exception as exc:
    error = str(exc)
result = runtime.globals().TITHE_SLASH280_RESULT
receipt = {"scope": "Actual core slash registry and Treasury registration, mocked native APIs; no installed client or gold movement.",
           "checks": result["checks"] if result else 0, "failed": result["failed"] if result else None, "error": error}
if len(sys.argv) == 2:
    Path(sys.argv[1]).write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
print(json.dumps(receipt))
sys.exit(1 if error or receipt["failed"] else 0)

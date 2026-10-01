"""Run offline addon suites with an existing Lupa LuaJIT 2.1 interpreter.

No client files, real Config.lua, or network services are used. Each suite runs
in a fresh subprocess so Lua os.exit cannot skip the remaining suites.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

TESTS = Path(__file__).resolve().parent
ADDON = TESTS.parent
SUITES = {
    "harness": (ADDON, Path("test/harness.lua")),
    "status": (TESTS, Path("test_status.lua")),
    "presence": (TESTS, Path("test_presence.lua")),
    "unverified": (TESTS, Path("test_unverified.lua")),
    "launcher": (TESTS, Path("test_launcher.lua")),
    "ui_polish": (TESTS, Path("test_ui_polish.lua")),
    "signed": (TESTS, Path("test_signed.lua")),
    "myname": (TESTS, Path("test_myname.lua")),
    "roster": (TESTS, Path("test_roster.lua")),
    "preview": (ADDON, Path("test/preview.lua")),
}


def input_hashes() -> dict[str, str]:
    paths = [
        ADDON / "OlympusVerify" / name
        for name in ("OlympusVerify.lua", "OlympusVerifyUI.lua", "OlympusVerifyPreview.lua", "OlympusVerifyRoster.lua", "OlympusVerify.toc", "Libs/OlympusHmac.lua")
    ]
    paths.extend([TESTS / "wow_mock.lua", Path(__file__).resolve()])
    paths.extend(cwd / script for cwd, script in SUITES.values())
    return {str(path.relative_to(ADDON)): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths if path.exists()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suite", choices=SUITES)
    parser.add_argument("--logdir", type=Path)
    args = parser.parse_args()
    if args.suite:
        import os
        import lupa
        import lupa.luajit21 as runtime

        lua = runtime.LuaRuntime(unpack_returned_tuples=True)
        assert runtime.LUA_VERSION == (5, 1), runtime.LUA_VERSION
        print(f"Lupa {lupa.__version__}; {lua.lua_implementation}; Lua {runtime.LUA_VERSION}", flush=True)
        cwd, script = SUITES[args.suite]
        os.chdir(cwd)
        lua.execute(script.read_text(encoding="utf-8"))
        return 0

    if args.logdir:
        args.logdir.mkdir(parents=True, exist_ok=True)
    before = input_hashes()
    results = []
    for name, (cwd, script) in SUITES.items():
        if not (cwd / script).exists():
            continue
        result = subprocess.run(
            [sys.executable, str(Path(__file__).resolve()), "--suite", name],
            text=True, encoding="utf-8", errors="replace", capture_output=True,
        )
        output = result.stdout + result.stderr
        if args.logdir:
            (args.logdir / f"{name}.log").write_text(output, encoding="utf-8")
        results.append({"suite": name, "exit_code": result.returncode})
        print(f"{name}: exit {result.returncode}", flush=True)
        print("\n".join(output.splitlines()[-4:]), flush=True)
    after = input_hashes()
    stable = before == after
    if not stable:
        print("Inputs changed during the run; rerun after edits settle.", flush=True)
    if args.logdir:
        report = {"interpreter": sys.executable, "suites": results, "inputs_unchanged": stable, "sha256_before": before, "sha256_after": after}
        (args.logdir / "results.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return int(not stable or any(item["exit_code"] != 0 for item in results))


if __name__ == "__main__":
    raise SystemExit(main())

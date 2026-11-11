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
    "ranks": (TESTS, Path("test_ranks.lua")),
    "removal_ranks": (TESTS, Path("test_removal_ranks.lua")),
    "browser_qr": (TESTS, Path("test_browser_qr.lua")),
    "presence": (TESTS, Path("test_presence.lua")),
    "unverified": (TESTS, Path("test_unverified.lua")),
    "launcher": (TESTS, Path("test_launcher.lua")),
    "ui_polish": (TESTS, Path("test_ui_polish.lua")),
    "signed": (TESTS, Path("test_signed.lua")),
    "myname": (TESTS, Path("test_myname.lua")),
    "roster": (TESTS, Path("test_roster.lua")),
    "roster_feedback196": (TESTS, Path("test_roster_feedback196.lua")),
    "preview": (ADDON, Path("test/preview.lua")),
    "secret_placeholder": (TESTS, Path("test_secret_placeholder.lua")),
    "queue_dismiss": (TESTS, Path("test_queue_dismiss.lua")),
    "stats_pilot": (TESTS, Path("test_stats_pilot.lua")),
    "army_stats": (TESTS, Path("test_army_stats.lua")),
    "treasury227": (TESTS, Path("test_treasury227.lua")),
    "membership_only227": (TESTS, Path("test_membership_only227.lua")),
    "native_roster_scope227": (TESTS, Path("test_native_roster_scope227.lua")),
    "per_whisper_membership227": (TESTS, Path("test_per_whisper_membership227.lua")),
    "membership_queue_hold227": (TESTS, Path("test_membership_queue_hold227.lua")),
    "launch_diagnostics229": (TESTS, Path("test_launch_diagnostics229.lua")),
    "launch_operations229": (TESTS, Path("test_launch_operations229.lua")),
    "auto_sync232": (TESTS, Path("test_auto_sync232.lua")),
    "performance235": (TESTS, Path("test_performance235.lua")),
    "slash_registration234": (TESTS, Path("test_slash_registration234.lua")),
    "officer_invites233": (TESTS, Path("test_officer_invites233.lua")),
    "live242": (TESTS, Path("test_live242.lua")),
    "dan155_census": (TESTS, Path("test_dan155_census.lua")),
    "bridge_status267": (TESTS, Path("test_bridge_status267.lua")),
    "roster268": (TESTS, Path("test_roster268.lua")),
    "guild_status268": (TESTS, Path("test_guild_status268.lua")),
}
TARGETED_ONLY = {"dan155_census", "bridge_status267", "roster268", "guild_status268"}


def input_hashes() -> dict[str, str]:
    paths = [
        ADDON / "OlympusVerify" / name
        for name in ("OlympusVerify.lua", "OlympusVerifyUI.lua", "OlympusVerifyAutoSync.lua", "OlympusVerifyPreview.lua", "OlympusVerifyRoster.lua", "OlympusVerifyGuild.lua", "OlympusVerifyRanks.lua", "OlympusVerify.toc", "OlympusVerifyLists.lua", "Libs/OlympusHmac.lua", "Libs/OlympusQr.lua", "OlympusVerifyBrowser.lua", "OlympusVerifyCensus.lua", "OlympusVerifyTreasury.lua", "OlympusLaunchQueue.lua", "OlympusVerifyLaunch229.lua", "OlympusVerifyOfficerInvites233.lua")
    ]
    paths.extend([TESTS / "wow_mock.lua", Path(__file__).resolve()])
    paths.extend(cwd / script for cwd, script in SUITES.values())
    return {str(path.relative_to(ADDON)): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths if path.is_file()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suite", choices=SUITES)
    parser.add_argument("--logdir", type=Path)
    parser.add_argument("--dan-archive", type=Path, help="Explicit Olympus1.5.5 ZIP for the targeted public-checkpoint runtime test")
    args = parser.parse_args()
    if args.dan_archive is not None and args.suite != "dan155_census":
        parser.error("--dan-archive is only for --suite dan155_census")
    if args.suite == "dan155_census" and args.dan_archive is None:
        parser.error("--suite dan155_census requires --dan-archive")
    if args.suite:
        import os
        import lupa
        import lupa.luajit21 as runtime

        lua = runtime.LuaRuntime(unpack_returned_tuples=True)
        assert runtime.LUA_VERSION == (5, 1), runtime.LUA_VERSION
        if args.suite == "dan155_census":
            from zipfile import ZipFile
            with ZipFile(args.dan_archive.resolve(strict=True)) as archive:
                source = archive.read("Olympus/Bridge.lua").decode("utf-8-sig")
                toc = archive.read("Olympus/Olympus.toc").decode("utf-8-sig")
            versions = [line.partition(":")[2].strip() for line in toc.splitlines() if line.startswith("## Version:")]
            if versions != ["1.5.5"]:
                parser.error("the targeted test requires the supplied Olympus1.5.5 archive")
            lua.globals().DAN155_BRIDGE_SOURCE = source
            lua.globals().DAN155_ADDON_VERSION = versions[0]
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
        if name in TARGETED_ONLY:
            continue
        if not (cwd / script).is_file():
            # O1_OPS-03 (Master QA, 28 Oct 2026): a missing declared suite must never yield a green partial run.
            row = {"suite": name, "exit_code": 1, "error": "missing_suite"}
            output = f"Required suite file is missing: {name} ({script.as_posix()}).\n"
        else:
            result = subprocess.run(
                [sys.executable, str(Path(__file__).resolve()), "--suite", name],
                text=True, encoding="utf-8", errors="replace", capture_output=True,
            )
            row = {"suite": name, "exit_code": result.returncode}
            output = result.stdout + result.stderr
        if args.logdir:
            (args.logdir / f"{name}.log").write_text(output, encoding="utf-8")
        results.append(row)
        print(f"{name}: exit {row['exit_code']}", flush=True)
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

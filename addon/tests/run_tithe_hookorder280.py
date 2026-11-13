"""Actual Lua Treasury hooks with synthetic native events; no live money action."""
from pathlib import Path
import argparse
import contextlib
import hashlib
import json
import time
from lupa.luajit21 import LuaRuntime


def plain(value):
    if not hasattr(value, "items"):
        return value
    items = list(value.items())
    if items and all(type(key) is int for key, _ in items):
        return [plain(value[index]) for index in range(1, len(items) + 1)]
    return {key: plain(item) for key, item in items}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--source-root", type=Path)
    args = parser.parse_args()
    root = (args.source_root or Path(__file__).resolve().parents[2]).resolve()
    tests = root / "addon/tests"
    paths = [root / "addon/OlympusVerify" / name for name in
             ["OlympusVerifyTreasury.lua", "OlympusVerifyLive242.lua", "Libs/OlympusHmac.lua"]]
    paths += [tests / name for name in ["test_live242.lua", "wow_mock.lua",
              "test_tithe_hookorder280.lua", "tithe_hookorder_fuzz280.lua", "run_tithe_hookorder280.py"]]
    pins = {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}
    prefix = (tests / "test_live242.lua").read_text(encoding="utf-8").split("\ndo\n", 1)[0]
    def run(name, **values):
        lua = LuaRuntime(unpack_returned_tuples=True)
        lua.globals().LIVE280_NOW = int(time.time())
        for key, value in values.items():
            lua.globals()[key] = value
        with contextlib.chdir(tests):
            return plain(lua.execute(prefix + "\n" + (tests / name).read_text(encoding="utf-8")))
    started = time.monotonic()
    report = {"focused": run("test_tithe_hookorder280.lua")}
    report["seeded"] = [run("tithe_hookorder_fuzz280.lua", FUZZ_SEEDS=200),
                        run("tithe_hookorder_fuzz280.lua", FUZZ_SEEDS=500, FUZZ_UNRELATED=True),
                        run("tithe_hookorder_fuzz280.lua", FUZZ_ONLY=458, FUZZ_UNRELATED=True)]
    report["sourceUnchanged"] = all(hashlib.sha256(path.read_bytes()).hexdigest() == pins[str(path.relative_to(root))] for path in paths)
    report["inputs"] = pins
    report["seconds"] = time.monotonic() - started
    report["limits"] = ["Synthetic supported hooks and sampled native state; no actual client ordering acceptance",
                        "Unrelated equal wallet movement with an unobserved mail disappearance remains ambiguous; receipts are unclassified and never automatic credit",
                        "Interrupted seed458 is a liveness observation, not a requirement to restore the older ambiguous receipts"]
    args.evidence.mkdir(parents=True, exist_ok=True)
    (args.evidence / "result.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    passed = report["focused"]["checks"] == report["focused"]["passed"] == 36 and report["sourceUnchanged"]
    passed = passed and all(row["overCreditSequences"] == 0 and row["sequences"] > 0 and row["collected"] > 0 for row in report["seeded"])
    print(f"{report['focused']['passed']}/{report['focused']['checks']} hook-order checks; seeded sequences {sum(row['sequences'] for row in report['seeded'])}; {report['seconds']:.3f}s")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())

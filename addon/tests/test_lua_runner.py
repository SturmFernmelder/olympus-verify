"""CLI contract for declared Lua suites, using disposable scripts and the real Lupa runtime."""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

RUNNER = Path(__file__).with_name("run_lua_suites.py")
spec = importlib.util.spec_from_file_location("lua_suite_runner_contract", RUNNER)
runner = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(runner)


class LuaRunnerContract(unittest.TestCase):
    def fixture(self, *, missing=(), failing=None, exit_early=None, directory=None):
        # Copy only this public runner; never copy client Config.lua or alter a real suite.
        owner = self.enterContext(tempfile.TemporaryDirectory(dir=os.environ.get("MASTER_QA_LUA_RUNNER_FIXTURES")))
        addon = Path(owner) / "addon"
        copied = addon / "tests" / RUNNER.name
        copied.parent.mkdir(parents=True)
        shutil.copyfile(RUNNER, copied)
        for name, (cwd, script) in runner.SUITES.items():
            path = addon / (cwd / script).relative_to(runner.ADDON)
            if name in missing:
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            if name == directory:
                path.mkdir()
                continue
            text = f"assert(_VERSION == 'Lua 5.1'); print('contract-sentinel:{name}')\n"
            if name == failing:
                text += "error('synthetic suite failure')\n"
            if name == exit_early:
                text += "os.exit(0)\n"
            path.write_text(text, encoding="utf-8")
        return copied, Path(owner) / "logs"

    def run_fixture(self, copied, logdir, *args):
        return subprocess.run(
            [sys.executable, str(copied), "--logdir", str(logdir), *args],
            text=True, encoding="utf-8", errors="replace", capture_output=True,
        )

    def report(self, logdir):
        return json.loads((logdir / "results.json").read_text(encoding="utf-8"))

    def test_all_declared_suites_run_with_the_real_interpreter(self):
        copied, logs = self.fixture()
        result = self.run_fixture(copied, logs)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        report = self.report(logs)
        self.assertEqual([row["suite"] for row in report["suites"]], list(runner.SUITES))
        self.assertTrue(report["inputs_unchanged"])
        for name in runner.SUITES:
            output = (logs / f"{name}.log").read_text(encoding="utf-8")
            self.assertIn("Lupa ", output)
            self.assertIn("LuaJIT", output)
            self.assertIn(f"contract-sentinel:{name}", output)

    def test_each_missing_declared_suite_fails_and_is_reported(self):
        for name in runner.SUITES:
            with self.subTest(suite=name):
                copied, logs = self.fixture(missing={name})
                result = self.run_fixture(copied, logs)
                self.assertNotEqual(result.returncode, 0, f"{name} was silently skipped: {result.stdout}")
                rows = self.report(logs)["suites"]
                self.assertEqual([row["suite"] for row in rows], list(runner.SUITES))
                failed = [row for row in rows if row["exit_code"] != 0]
                self.assertEqual(failed, [{"suite": name, "exit_code": 1, "error": "missing_suite"}])
                self.assertIn("Required suite file is missing", (logs / f"{name}.log").read_text(encoding="utf-8"))

    def test_no_declared_files_cannot_be_a_successful_empty_run(self):
        copied, logs = self.fixture(missing=runner.SUITES)
        result = self.run_fixture(copied, logs)
        self.assertNotEqual(result.returncode, 0)
        rows = self.report(logs)["suites"]
        self.assertEqual([row["suite"] for row in rows], list(runner.SUITES))
        self.assertTrue(all(row["exit_code"] == 1 and row["error"] == "missing_suite" for row in rows))

    def test_missing_files_also_fail_without_logdir(self):
        copied, _ = self.fixture(missing=runner.SUITES)
        result = subprocess.run([sys.executable, str(copied)], text=True, encoding="utf-8", capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Required suite file is missing", result.stdout)

    def test_directory_in_place_of_declared_file_is_reported_as_failure(self):
        name = next(iter(runner.SUITES))
        copied, logs = self.fixture(directory=name)
        result = self.run_fixture(copied, logs)
        self.assertNotEqual(result.returncode, 0)
        row = next(row for row in self.report(logs)["suites"] if row["suite"] == name)
        self.assertEqual(row, {"suite": name, "exit_code": 1, "error": "missing_suite"})

    def test_a_lua_failure_does_not_hide_remaining_suites(self):
        name = next(iter(runner.SUITES))
        copied, logs = self.fixture(failing=name)
        result = self.run_fixture(copied, logs)
        self.assertNotEqual(result.returncode, 0)
        rows = self.report(logs)["suites"]
        self.assertEqual([row["suite"] for row in rows], list(runner.SUITES))
        self.assertEqual([row["suite"] for row in rows if row["exit_code"] != 0], [name])

    def test_lua_os_exit_cannot_skip_the_parent_remaining_suites(self):
        copied, logs = self.fixture(exit_early=next(iter(runner.SUITES)))
        result = self.run_fixture(copied, logs)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual([row["suite"] for row in self.report(logs)["suites"]], list(runner.SUITES))

    def test_selected_existing_suite_uses_the_real_interpreter(self):
        name = next(iter(runner.SUITES))
        copied, logs = self.fixture()
        result = self.run_fixture(copied, logs, "--suite", name)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(f"contract-sentinel:{name}", result.stdout)

    def test_selected_missing_suite_still_fails(self):
        name = next(iter(runner.SUITES))
        copied, logs = self.fixture(missing={name})
        result = self.run_fixture(copied, logs, "--suite", name)
        self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()

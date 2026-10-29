"""Runs tools/backfill-roles.py against a fake Worker on 127.0.0.1 with a made-up token.
Usage: python tools/tests/test_backfill_roles.py"""
import contextlib, http.server, importlib.util, io, json, pathlib, subprocess, sys, tempfile, threading, urllib.parse, urllib.request
from unittest.mock import patch

HERE = pathlib.Path(__file__).resolve().parent
SCRIPT = HERE.parent / "backfill-roles.py"
TOKEN = "made-up-test-token-0123456789"
IDS = [str(100000000000000000 + i) for i in range(45)]   # 45 member accounts; every third one lacks the role
SEEN = []
SINK = []
MODE = {"kind": "normal"}
ORIGIN = "https://synthetic-worker.invalid"
def valid_summary(**changes):
    result = {"apply": False, "totalMembers": 0, "selected": 0, "examined": 0, "granted": 0,
              "wouldGrant": 0, "alreadyHad": 0, "notInServer": 0, "blocked": 0,
              "calls": 0, "attempts": 0, "retries": 0, "failed": [], "cursor": "", "finished": True,
              "next": None, "sample": {"granted": [], "wouldGrant": [], "notInServer": [], "blocked": []}}
    result.update(changes)
    return result

def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE.parent / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

backfill = load("backfill_under_test", "backfill-roles.py")
guild_map = load("guild_map_under_test", "guild-map.py")

class Fake(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        u = urllib.parse.urlparse(self.path); q = dict(urllib.parse.parse_qsl(u.query))
        SEEN.append({"path": u.path, "q": q, "auth": self.headers.get("Authorization")})
        if MODE["kind"] == "redirect":
            self.send_response(MODE["status"])
            self.send_header("Location", MODE["location"])
            self.end_headers()
            return
        if MODE["kind"] == "response":
            self.send_response(MODE["status"]); self.end_headers(); self.wfile.write(MODE["body"]); return
        if MODE["kind"] == "sequence":
            payload = MODE["first"] if q.get("after", "") == "" else MODE["later"]
            self.send_response(200); self.end_headers(); self.wfile.write(json.dumps(payload).encode()); return
        if self.headers.get("Authorization") != f"Bearer {TOKEN}":
            self.send_response(401); self.end_headers(); return
        after, limit, apply = q.get("after", ""), int(q["limit"]), q.get("apply") == "1"
        rows = [i for i in IDS if i > after][:limit]
        lacking = [i for i in rows if int(i) % 3 == 0]
        body = {"apply": apply, "totalMembers": len(IDS), "selected": len(rows), "examined": len(rows),
                "granted": len(lacking) if apply else 0, "wouldGrant": 0 if apply else len(lacking),
                "alreadyHad": len(rows) - len(lacking), "notInServer": 0, "blocked": 0, "failed": [],
                "calls": len(rows), "attempts": len(rows), "retries": 0,
                "cursor": rows[-1] if rows else after, "finished": len(rows) < limit,
                "next": None if len(rows) < limit else f"/admin/backfill-roles?limit={limit}&after={rows[-1]}" + ("&apply=1" if apply else ""),
                "sample": {"granted": lacking[:10] if apply else [], "wouldGrant": [] if apply else lacking[:10], "notInServer": [], "blocked": []}}
        data = json.dumps(body).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(data)

class Sink(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        SINK.append(self.headers.get("Authorization"))
        self.send_response(200); self.end_headers(); self.wfile.write(b"{}")

srv = http.server.HTTPServer(("127.0.0.1", 0), Fake)
sink = http.server.HTTPServer(("127.0.0.1", 0), Sink)
threading.Thread(target=srv.serve_forever, daemon=True).start()
threading.Thread(target=sink.serve_forever, daemon=True).start()
tmp = tempfile.mkdtemp()
cfg = pathlib.Path(tmp) / "config.json"
cfg.write_text(json.dumps({"worker_url": ORIGIN, "watcher_token": TOKEN}))

# The production URL admission remains strict HTTPS. This explicitly installed test transport maps only the
# reserved synthetic origin to our owned HTTP loopback fixture, retaining the production NoRedirect handler.
# No production flag, environment bypass or insecure-HTTP exception exists in either helper.
real_build_opener = urllib.request.build_opener
class LoopbackTransport:
    def __init__(self, opener): self.opener = opener
    def open(self, request, timeout):
        parsed = urllib.parse.urlsplit(request.full_url)
        if parsed.scheme != "https" or parsed.netloc != "synthetic-worker.invalid":
            raise AssertionError("test transport refused a non-synthetic origin")
        local = f"http://127.0.0.1:{srv.server_port}" + parsed.path + ("?" + parsed.query if parsed.query else "")
        mapped = urllib.request.Request(local, method=request.get_method(), headers=dict(request.header_items()))
        return self.opener.open(mapped, timeout=timeout)

def local_opener(*handlers):
    return LoopbackTransport(real_build_opener(urllib.request.ProxyHandler({}), *handlers))

CLI_TRANSPORT = r'''
import runpy, sys, urllib.parse, urllib.request
script, config, port = sys.argv[1:]
real_build = urllib.request.build_opener
class Local:
    def __init__(self, opener): self.opener = opener
    def open(self, request, timeout):
        parsed = urllib.parse.urlsplit(request.full_url)
        if parsed.scheme != "https" or parsed.netloc != "synthetic-worker.invalid":
            raise AssertionError("non-synthetic test origin")
        url = "http://127.0.0.1:" + port + parsed.path + ("?" + parsed.query if parsed.query else "")
        return self.opener.open(urllib.request.Request(url, method=request.get_method(), headers=dict(request.header_items())), timeout=timeout)
urllib.request.build_opener = lambda *handlers: Local(real_build(urllib.request.ProxyHandler({}), *handlers))
sys.argv = [script, "--config", config, "--pause", "0"]
runpy.run_path(script, run_name="__main__")
'''

def run_cli():
    return subprocess.run([sys.executable, "-c", CLI_TRANSPORT, str(SCRIPT), str(cfg), str(srv.server_port)],
                          capture_output=True, text=True, timeout=10)

results = []
def check(name, cond):
    results.append(bool(cond)); print(("PASS " if cond else "FAIL ") + name)

def run(*extra):
    SEEN.clear()
    return invoke(backfill.main, argv=[str(SCRIPT), "--config", str(cfg), "--pause", "0", *extra])

def invoke(function, *args, argv=None):
    stdout, stderr = io.StringIO(), io.StringIO()
    code, value = 0, None
    with patch.object(sys, "argv", argv or ["synthetic-test"]), patch("urllib.request.build_opener", side_effect=local_opener):
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            try:
                value = function(*args)
            except SystemExit as error:
                code = error.code if isinstance(error.code, int) else 1
                if not isinstance(error.code, int): print(error.code, file=stderr)
    completed = subprocess.CompletedProcess([], code, stdout.getvalue(), stderr.getvalue())
    completed.value = value
    return completed

dry = run()
lacking = sum(1 for i in IDS if int(i) % 3 == 0)
check("dry run exits cleanly", dry.returncode == 0)
check("dry run pages through all 45 accounts in 20s", [s["q"].get("after", "") for s in SEEN] == ["", IDS[19], IDS[39]])
check("dry run never asks to apply", all("apply" not in s["q"] for s in SEEN))
check(f"dry run reports {lacking} to grant and changes nothing", f"would grant Guild Member:  {lacking}" in dry.stdout and "DRY RUN" in dry.stdout)
check("dry run says how to apply", "--apply" in dry.stdout)
check("the token is sent as a bearer header", all(s["auth"] == f"Bearer {TOKEN}" for s in SEEN))
check("the token is never printed", TOKEN not in dry.stdout + dry.stderr)

app = run("--apply")
check("apply passes apply=1 on every page", SEEN and all(s["q"].get("apply") == "1" for s in SEEN))
check(f"apply reports {lacking} granted", f"granted Guild Member:  {lacking}" in app.stdout and "APPLIED" in app.stdout)

cfg.write_text(json.dumps({"worker_url": ORIGIN, "watcher_token": "wrong"}))
bad = run()
check("a wrong token stops with a clear 401 message", bad.returncode != 0 and "401" in (bad.stdout + bad.stderr))

# Exercise the real process entrypoints as well as the in-process main/transport fixture. The CLI uses only an
# explicit disposable config, and an HTTP origin must fail before the dummy bearer can leave that process.
for filename in ("backfill-roles.py", "guild-map.py"):
    help_result = subprocess.run([sys.executable, str(HERE.parent / filename), "--help"], capture_output=True, text=True, timeout=10)
    check(f"{filename} actual --help exits0 without config", help_result.returncode == 0 and "--config" in help_result.stdout)
    cfg.write_text(json.dumps({"worker_url": f"http://127.0.0.1:{srv.server_port}", "watcher_token": TOKEN}))
    SEEN.clear()
    rejected = subprocess.run([sys.executable, str(HERE.parent / filename), "--config", str(cfg)], capture_output=True, text=True, timeout=10)
    check(f"{filename} actual CLI refuses HTTP before any request", rejected.returncode != 0 and "HTTPS origin" in rejected.stderr and not SEEN and TOKEN not in rejected.stdout + rejected.stderr)

for helper, function, extra in [("backfill", backfill.call, ("", False)), ("guild-map", guild_map.fetch, ())]:
    MODE.update(kind="response", status=200, body=b'{"synthetic":true}')
    SEEN.clear()
    normal = invoke(function, ORIGIN + "/", TOKEN, *extra)
    check(f"{helper} accepts bare HTTPS origin with trailing slash", normal.returncode == 0 and normal.value == {"synthetic": True} and len(SEEN) == 1 and SEEN[0]["auth"] == "Bearer " + TOKEN)
    for status in (301, 302, 303, 307, 308):
        for context, location in [("other origin", f"http://127.0.0.1:{sink.server_port}/sink"),
                                  ("same origin", f"http://127.0.0.1:{srv.server_port}/sink")]:
            SEEN.clear(); SINK.clear()
            MODE.update(kind="redirect", status=status, location=location)
            outcome = invoke(function, ORIGIN, TOKEN, *extra)
            check(f"{helper} refuses {status} {context} without a second request",
                  outcome.returncode != 0 and "redirect refused" in outcome.stderr and len(SEEN) == 1 and not SINK)
            check(f"{helper} {status} {context} failure hides bearer", TOKEN not in outcome.stdout + outcome.stderr)
    for status in (400, 403, 429, 500, 503):
        MODE.update(kind="response", status=status, body=("untrusted-echo " + TOKEN).encode())
        outcome = invoke(function, ORIGIN, TOKEN, *extra)
        check(f"{helper} HTTP{status} reports status without echoing body",
              outcome.returncode != 0 and str(status) in outcome.stderr and TOKEN not in outcome.stdout + outcome.stderr)
    for label, body in [("invalid UTF8", b"\xff"), ("invalid JSON", b"{"), ("array", b"[]"), ("null", b"null")]:
        MODE.update(kind="response", status=200, body=body)
        outcome = invoke(function, ORIGIN, TOKEN, *extra)
        check(f"{helper} rejects {label} with an actionable fixed message",
              outcome.returncode != 0 and "invalid JSON response" in outcome.stderr)
    for origin in (None, 7, "", "http://example.invalid", "ftp://example.invalid", "https://name:password@example.invalid",
                   "https://example.invalid/path", "https://example.invalid?query=1", "https://example.invalid#fragment",
                   "https://example.invalid?", "https://example.invalid#",
                   "https://example.invalid:bad", "https://example.invalid:65536", "https://example.invalid\\path",
                   "https://example.invalid\n", " https://example.invalid", "https://"):
        SEEN.clear()
        outcome = invoke(function, origin, TOKEN, *extra)
        check(f"{helper} rejects invalid origin class {type(origin).__name__}:{repr(origin)} before transport",
              outcome.returncode != 0 and "HTTPS origin" in outcome.stderr and not SEEN and TOKEN not in outcome.stdout + outcome.stderr)
    with patch("urllib.request.build_opener") as mocked:
        mocked.return_value.open.side_effect = urllib.error.URLError(TOKEN)
        error = io.StringIO()
        with contextlib.redirect_stderr(error):
            try: function(ORIGIN, TOKEN, *extra)
            except SystemExit as failure: message = str(failure)
        check(f"{helper} hides arbitrary transport reason", TOKEN not in message and "Could not reach" in message)

MODE.update(kind="response", status=200, body=b'{}')
SEEN.clear()
encoded = invoke(backfill.call, ORIGIN, TOKEN, "cursor &?/", True)
check("backfill query keeps cursor as one value and apply explicit", encoded.returncode == 0 and SEEN[0]["q"] == {"limit": "20", "after": "cursor &?/", "apply": "1"})
SEEN.clear()
encoded = invoke(guild_map.fetch, ORIGIN, TOKEN, "guild &?/")
check("guild-map query keeps guild as one value", encoded.returncode == 0 and SEEN[0]["q"] == {"guild": "guild &?/"})

cfg.write_text(json.dumps({"worker_url": ORIGIN, "watcher_token": TOKEN}))
for label, payload, expected_code in [
    ("JSON error", {"error": TOKEN}, 1),
    ("stopped note", valid_summary(note="stopped: " + TOKEN, finished=False, next="/admin/backfill-roles?limit=20&after="), 0),
    ("per-account error", valid_summary(failed=[{"id": IDS[0], "error": TOKEN}]), 0),
    ("invalid count", valid_summary(examined=TOKEN), 1),
    ("invalid total", valid_summary(totalMembers=TOKEN), 1),
    ("invalid sample reference", valid_summary(sample={"wouldGrant": [TOKEN]}), 1),
    ("invalid failure reference", valid_summary(failed=[{"id": TOKEN, "error": TOKEN}]), 1),
    ("invalid cursor", valid_summary(cursor=TOKEN), 1),
]:
    MODE.update(kind="response", status=200, body=json.dumps(payload).encode())
    outcome = run()
    check(f"backfill main hides arbitrary200 {label}", outcome.returncode == expected_code and TOKEN not in outcome.stdout + outcome.stderr)

malformed = [("missing summary fields", {}), ("truthy nonboolean finished", valid_summary(finished="yes")),
             ("wrong apply mode", valid_summary(apply=True)), ("null note", valid_summary(note=None)),
             ("finished with next link", valid_summary(next="https://foreign.invalid/")),
             ("pending with missing next", valid_summary(finished=False, cursor=IDS[0])),
             ("pending with foreign next", valid_summary(finished=False, cursor=IDS[0], next="https://foreign.invalid/")),
             ("pending without cursor progress", valid_summary(finished=False, next="/admin/backfill-roles?limit=20&after=")),
             ("stopped but finished", valid_summary(note="stopped: reason")),
             ("missing failed array", {key: value for key, value in valid_summary().items() if key != "failed"}),
             ("missing count", {key: value for key, value in valid_summary().items() if key != "examined"})]
for label, payload in malformed:
    MODE.update(kind="response", status=200, body=json.dumps(payload).encode())
    outcome = run_cli()
    check(f"actual backfill CLI refuses malformed200 {label}", outcome.returncode != 0 and "backfill summary" in outcome.stderr and "DRY RUN:" not in outcome.stdout and TOKEN not in outcome.stdout + outcome.stderr)

# A later page must obey the same TEXT ordering as the Worker's ORDER BY discord_id.
# Testing only the initial empty cursor misses both a backwards page and an empty
# pending cursor that would otherwise make main report an incomplete run as success.
first_cursor = IDS[19]
first_page = valid_summary(totalMembers=len(IDS), selected=20, examined=20, alreadyHad=20,
                           calls=20, attempts=20, finished=False, cursor=first_cursor,
                           next=f"/admin/backfill-roles?limit=20&after={first_cursor}")
for label, cursor, note in [("backwards pending cursor", IDS[0], ""),
                            ("empty pending cursor after progress", "", ""),
                            ("backwards stopped cursor", IDS[0], "stopped: synthetic pause")]:
    later_page = valid_summary(totalMembers=len(IDS), finished=False, cursor=cursor, note=note,
                               next=f"/admin/backfill-roles?limit=20&after={cursor}")
    MODE.update(kind="sequence", first=first_page, later=later_page)
    SEEN.clear()
    outcome = run_cli()
    check(f"actual backfill CLI refuses later-page {label} before another request or success report",
          outcome.returncode != 0 and "backfill summary" in outcome.stderr and len(SEEN) == 2
          and "DRY RUN:" not in outcome.stdout and TOKEN not in outcome.stdout + outcome.stderr)

for label, previous, cursor, finished, note, expected_code in [
    ("TEXT regression despite numeric growth", "90000000000000000", "100000000000000000", False, "", 1),
    ("TEXT progress despite numeric decrease", "100000000000000000", "90000000000000000", True, "", 0),
    ("stopped page retaining its original cursor", first_cursor, first_cursor, False, "stopped: synthetic pause", 0),
]:
    initial = {**first_page, "cursor": previous, "next": f"/admin/backfill-roles?limit=20&after={previous}"}
    later = valid_summary(totalMembers=len(IDS), finished=finished, cursor=cursor, note=note,
                          next=None if finished else f"/admin/backfill-roles?limit=20&after={cursor}")
    MODE.update(kind="sequence", first=initial, later=later)
    SEEN.clear()
    outcome = run_cli()
    check(f"actual backfill CLI preserves {label}", outcome.returncode == expected_code and len(SEEN) == 2
          and ("DRY RUN:" in outcome.stdout) == (expected_code == 0)
          and (expected_code == 0 or "backfill summary" in outcome.stderr)
          and TOKEN not in outcome.stdout + outcome.stderr)

for server in (srv, sink): server.shutdown(); server.server_close()
cfg.unlink(); pathlib.Path(tmp).rmdir()
print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)

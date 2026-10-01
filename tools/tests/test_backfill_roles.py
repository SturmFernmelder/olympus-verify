"""Runs tools/backfill-roles.py against a fake Worker on 127.0.0.1 with a made-up token.
Usage: python tools/tests/test_backfill_roles.py"""
import http.server, json, os, pathlib, subprocess, sys, tempfile, threading, urllib.parse

HERE = pathlib.Path(__file__).resolve().parent
SCRIPT = HERE.parent / "backfill-roles.py"
TOKEN = "made-up-test-token-0123456789"
IDS = [str(100000000000000000 + i) for i in range(45)]   # 45 member accounts; every third one lacks the role
SEEN = []

class Fake(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        u = urllib.parse.urlparse(self.path); q = dict(urllib.parse.parse_qsl(u.query))
        SEEN.append({"path": u.path, "q": q, "auth": self.headers.get("Authorization")})
        if self.headers.get("Authorization") != f"Bearer {TOKEN}":
            self.send_response(401); self.end_headers(); return
        after, limit, apply = q.get("after", ""), int(q["limit"]), q.get("apply") == "1"
        rows = [i for i in IDS if i > after][:limit]
        lacking = [i for i in rows if int(i) % 3 == 0]
        body = {"apply": apply, "totalMembers": len(IDS), "examined": len(rows),
                "granted": len(lacking) if apply else 0, "wouldGrant": 0 if apply else len(lacking),
                "alreadyHad": len(rows) - len(lacking), "notInServer": 0, "failed": [],
                "cursor": rows[-1] if rows else after, "finished": len(rows) < limit,
                "sample": {"granted": lacking[:10] if apply else [], "wouldGrant": [] if apply else lacking[:10]}}
        data = json.dumps(body).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(data)

srv = http.server.HTTPServer(("127.0.0.1", 0), Fake)
threading.Thread(target=srv.serve_forever, daemon=True).start()
tmp = tempfile.mkdtemp()
cfg = pathlib.Path(tmp) / "config.json"
cfg.write_text(json.dumps({"worker_url": f"http://127.0.0.1:{srv.server_port}", "watcher_token": TOKEN}))
env = dict(os.environ, NO_PROXY="127.0.0.1,localhost", no_proxy="127.0.0.1,localhost")
for k in ("HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"):
    env.pop(k, None)

results = []
def check(name, cond):
    results.append(bool(cond)); print(("PASS " if cond else "FAIL ") + name)

def run(*extra):
    SEEN.clear()
    return subprocess.run([sys.executable, str(SCRIPT), "--config", str(cfg), "--pause", "0", *extra],
                          capture_output=True, text=True, env=env, timeout=60)

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

cfg.write_text(json.dumps({"worker_url": f"http://127.0.0.1:{srv.server_port}", "watcher_token": "wrong"}))
bad = run()
check("a wrong token stops with a clear 401 message", bad.returncode != 0 and "401" in (bad.stdout + bad.stderr))
srv.shutdown()
print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)

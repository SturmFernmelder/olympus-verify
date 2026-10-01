"""Give Guild Member back to everyone the Worker counts as in the guild but Discord shows without the role.

MEE6's role menus in #pick-your-role can take Guild Member away in the same moment the bot grants it (25 Sep 2026;
see docs/deploy-checklist.md, build .37). From build .37 on, /verify and /verify-status put it back for whoever runs
them. This finds everyone else in one pass, through the Worker's /admin/backfill-roles.

    python backfill-roles.py            # dry run: counts only, changes nothing
    python backfill-roles.py --apply    # grant the role where it is missing

Standard library only. Reads worker_url and watcher_token from ../watcher/config.json, like guild-map.py; the token
is sent to the Worker and never printed. Banned accounts are skipped by the Worker (build .37 or later).
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

HERE = pathlib.Path(__file__).resolve().parent
# 20 per page keeps one request at 40 Discord calls at most (a lookup, plus a grant where the role is missing),
# under the 50 a Worker on the free plan may make per request.
PAGE = 20


def call(base: str, token: str, after: str, apply: bool) -> dict[str, Any]:
    q = {"limit": str(PAGE), "after": after}
    if apply:
        q["apply"] = "1"
    url = base.rstrip("/") + "/admin/backfill-roles?" + urllib.parse.urlencode(q)
    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("User-Agent", "olympus-backfill-roles/1.0")
    try:
        with urllib.request.urlopen(req, timeout=90) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:300]
        if e.code == 401:
            sys.exit("401 from the Worker: watcher_token in config.json does not match the deployed WATCHER_TOKEN.")
        if e.code == 404:
            sys.exit("404: this Worker build has no /admin/backfill-roles. Deploy the current build, then retry.")
        sys.exit(f"Worker returned {e.code}: {body}")
    except urllib.error.URLError as e:
        sys.exit(f"could not reach the Worker: {e.reason}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Re-grant Guild Member to verified members who lost it.")
    ap.add_argument("--config", default=str(HERE.parent / "watcher" / "config.json"),
                    help="watcher config.json holding worker_url and watcher_token")
    ap.add_argument("--apply", action="store_true", help="grant the role (without this, only count)")
    ap.add_argument("--pause", type=float, default=1.0, help="seconds between pages")
    args = ap.parse_args()

    cfg_path = pathlib.Path(args.config)
    if not cfg_path.exists():
        sys.exit(f"config not found: {cfg_path}")
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    for key in ("worker_url", "watcher_token"):
        if not cfg.get(key):
            sys.exit(f"{key} is missing from {cfg_path}")

    totals = {"examined": 0, "granted": 0, "wouldGrant": 0, "alreadyHad": 0, "notInServer": 0}
    ids: list[str] = []
    failed: list[dict[str, str]] = []
    after, pages, members = "", 0, 0
    while True:
        r = call(cfg["worker_url"], cfg["watcher_token"], after, args.apply)
        if "error" in r:
            sys.exit(f"the Worker refused: {r['error']}")
        pages += 1
        members = r.get("totalMembers", members)
        for k in totals:
            totals[k] += int(r.get(k) or 0)
        sample = r.get("sample") or {}
        ids += (sample.get("granted") if args.apply else sample.get("wouldGrant")) or []
        failed += r.get("failed") or []
        note = r.get("note") or ""
        if note.startswith("stopped"):
            print(note)
            break
        if r.get("finished") or not r.get("cursor") or r.get("cursor") == after:
            break
        after = r["cursor"]
        time.sleep(args.pause)

    verb = "granted" if args.apply else "would grant"
    missing = totals["granted"] if args.apply else totals["wouldGrant"]
    print(f"{'APPLIED' if args.apply else 'DRY RUN'}: {members} accounts have a character in the guild; "
          f"{totals['examined']} checked in {pages} page(s).")
    print(f"  already had Guild Member: {totals['alreadyHad']}")
    print(f"  {verb} Guild Member:  {missing}")
    print(f"  no longer in the Discord: {totals['notInServer']}")
    if ids:
        # The Worker returns up to ten ids per page as a sample, so this is a spot check rather than the full list.
        shown = ids[:40]
        print(f"  for example: " + ", ".join(shown) + (" ..." if len(ids) > len(shown) else ""))
    for f in failed:
        print(f"  FAILED {f.get('id')}: {f.get('error')}")
    if not args.apply and missing:
        print("Run again with --apply to grant them.")


if __name__ == "__main__":
    main()

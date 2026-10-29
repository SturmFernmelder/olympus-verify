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
import http.client
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


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """A redirect must never move the operator bearer or repeat an apply request."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def worker_origin(base: str) -> str:
    # Master QA, 28 Oct 2026: match the watcher's bare-HTTPS-origin admission before adding credentials.
    try:
        url = urllib.parse.urlsplit(base)
        valid = (isinstance(base, str) and not any(ord(c) <= 32 or ord(c) == 127 for c in base)
                 and not any(c in base for c in "\\?#") and url.scheme == "https" and bool(url.hostname)
                 and url.username is None and url.password is None and not url.query and not url.fragment
                 and url.path in ("", "/"))
        url.port
    except (TypeError, ValueError, AttributeError):
        valid = False
    if not valid:
        sys.exit("worker_url must be an HTTPS origin without credentials, path, query or fragment.")
    return base.rstrip("/")


def call(base: str, token: str, after: str, apply: bool) -> dict[str, Any]:
    origin = worker_origin(base)
    q = {"limit": str(PAGE), "after": after}
    if apply:
        q["apply"] = "1"
    url = origin + "/admin/backfill-roles?" + urllib.parse.urlencode(q)
    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("User-Agent", "olympus-backfill-roles/1.0")
    try:
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=90) as res:
            result = json.loads(res.read().decode("utf-8"))
            if not isinstance(result, dict):
                sys.exit("Worker returned an invalid JSON response.")
            return result
    except urllib.error.HTTPError as e:
        # The body and reason may echo credentials or other private data. Keep only the status.
        e.close()
        if 300 <= e.code < 400:
            sys.exit("Worker redirect refused; check worker_url against the Worker's own HTTPS origin.")
        if e.code == 401:
            sys.exit("401 from the Worker: watcher_token in config.json does not match the deployed WATCHER_TOKEN.")
        if e.code == 404:
            sys.exit("404: this Worker build has no /admin/backfill-roles. Deploy the current build, then retry.")
        sys.exit(f"Worker returned HTTP {e.code}; no response body was logged.")
    except urllib.error.URLError:
        sys.exit("Could not reach the Worker; check the origin and connection.")
    except (UnicodeDecodeError, ValueError):
        sys.exit("Worker returned an invalid JSON response.")
    except (TimeoutError, OSError, http.client.HTTPException):
        sys.exit("Could not read the Worker response; check the connection and retry.")


def valid_account_id(value: Any) -> bool:
    return isinstance(value, str) and 17 <= len(value) <= 20 and all("0" <= c <= "9" for c in value)


def validate_summary(result: dict[str, Any], apply: bool, after: str) -> None:
    """Only counts and account references may reach the operator summary, never arbitrary response values."""
    for key in ("totalMembers", "selected", "examined", "granted", "wouldGrant", "alreadyHad", "notInServer", "blocked", "calls", "attempts", "retries"):
        value = result.get(key)
        if type(value) is not int or value < 0:
            sys.exit("Worker returned an invalid backfill summary; no response body was logged.")
    if type(result.get("finished")) is not bool or type(result.get("apply")) is not bool or result["apply"] != apply:
        sys.exit("Worker returned an invalid backfill summary; no response body was logged.")
    sample, failed = result.get("sample"), result.get("failed")
    if not isinstance(sample, dict) or not isinstance(failed, list):
        sys.exit("Worker returned an invalid backfill summary; no response body was logged.")
    for key in ("granted", "wouldGrant", "notInServer", "blocked"):
        ids = sample.get(key)
        if not isinstance(ids, list) or not all(valid_account_id(value) for value in ids):
            sys.exit("Worker returned invalid account references; no response body was logged.")
    if not all(isinstance(item, dict) and valid_account_id(item.get("id")) for item in failed):
        sys.exit("Worker returned invalid account references; no response body was logged.")
    note, cursor = result.get("note", ""), result.get("cursor")
    if not isinstance(note, str) or not isinstance(cursor, str) or (cursor != "" and not valid_account_id(cursor)):
        sys.exit("Worker returned an invalid backfill summary; no response body was logged.")
    if "next" not in result or (result["finished"] and result["next"] is not None):
        sys.exit("Worker returned an invalid backfill summary; no response body was logged.")
    # The Worker orders its TEXT Discord IDs lexicographically. A later page
    # cannot move backwards, even when stopped; an unfinished running page
    # must advance so it cannot repeat work or masquerade as a completed run.
    if cursor < after:
        sys.exit("Worker returned an invalid backfill summary; no response body was logged.")
    if not result["finished"]:
        expected = f"/admin/backfill-roles?limit={PAGE}&after={cursor}" + ("&apply=1" if apply else "")
        if result["next"] != expected or (cursor <= after and not note.startswith("stopped")):
            sys.exit("Worker returned an invalid backfill summary; no response body was logged.")
    elif note.startswith("stopped"):
        sys.exit("Worker returned an invalid backfill summary; no response body was logged.")


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
            sys.exit("The Worker refused the backfill; check its sanitized operator logs and configuration.")
        validate_summary(r, args.apply, after)
        pages += 1
        members = r.get("totalMembers", members)
        for k in totals:
            totals[k] += int(r.get(k) or 0)
        sample = r.get("sample") or {}
        ids += (sample.get("granted") if args.apply else sample.get("wouldGrant")) or []
        failed += r.get("failed") or []
        note = r.get("note") or ""
        if note.startswith("stopped"):
            print("Stopped: the Worker paused this page. Review its sanitized operator logs and current role state before retrying.")
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
        print(f"  FAILED {f['id']}: inspect the Worker's sanitized operator logs.")
    if not args.apply and missing:
        print("Run again with --apply to grant them.")


if __name__ == "__main__":
    main()

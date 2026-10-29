# Operator helper transport

The guild-map and backfill-role helpers use the same `worker_url` and bearer as the watcher. Set the URL to the
Worker's bare HTTPS origin, for example `https://olympus-verify.example.workers.dev`. A final `/` is accepted;
credentials, paths, queries, fragments, malformed ports, backslashes and whitespace are refused before any request.
Neither helper accepts an HTTP URL or follows a redirect, including one to the same origin. A redirect can otherwise
move the bearer or repeat a backfill apply operation (Master QA finding ECO-F01, 28 October 2026).

A refusal reports the HTTP status or a fixed connection/JSON error. Upstream response bodies and arbitrary transport
reasons are never printed because they can contain echoed credentials or personal data. For a 401, verify the private
configuration locally. For other errors, use the Worker's sanitized operator logs and the documented runbook; never
paste a bearer or raw provider response into a ticket. A redirect requires correcting the configured origin before
retrying. After a backfill connection failure, review the current role state before deciding to run the operation again.
Backfill summaries accept numeric counts and valid account references only. Refusal, stopped-page and per-account
error text from an otherwise successful JSON response is replaced with fixed operator guidance for the same reason.
The complete page contract is required: the requested apply mode, a boolean completion state, all counts, sample and
failure arrays, and a consistent cursor/next link. A missing or malformed summary is an error, never a successful
zero-count report. A paused page may keep its cursor only when the Worker explicitly reports it as stopped.

`python tools/tests/test_backfill_roles.py` uses a made-up bearer and two owned loopback servers. Its explicitly
installed test transport maps only a reserved synthetic HTTPS origin to that local fixture and preserves the real
redirect refusal handler. The production helpers have no insecure-HTTP test switch. The test covers dry-run/apply
paging, actual CLI help and invalid-origin exits, redirect status codes, credential-safe error output, malformed
responses and query encoding for both helpers. `python tools/tests/test_review.py` exercises the guild-map permission
review independently of transport. Neither test changes production roles, reads private config or calls Discord.

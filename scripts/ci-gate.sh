#!/usr/bin/env bash
# The aggregate CI gate (Codex review of c93fc0e, 23:46 UTC): GitHub counts a SKIPPED required job as passed, so a
# `check` job that merely `needs` the others would let a failed watcher or addon job through whenever it was skipped.
# This runs with `if: always()` and fails unless every named job result is exactly "success"; failure, cancelled,
# skipped and an unset result all fail. Inputs are environment variables so the gate can be tested without GitHub:
#
#   WORKER=success WATCHER=success ADDON=success bash scripts/ci-gate.sh
set -u
rc=0
for job in WORKER WATCHER ADDON; do
  result="${!job:-}"
  if [ "$result" = "success" ]; then
    echo "$job: success"
  else
    echo "$job: ${result:-no result}: the gate fails" >&2
    rc=1
  fi
done
[ "$rc" -eq 0 ] && echo "every job succeeded"
exit "$rc"

#!/usr/bin/env bash
# The bounded qualification gate must not turn skipped dependencies into a pass.
# This runs with `if: always()` and fails unless every named job result is exactly "success"; failure, cancelled,
# skipped and an unset result all fail. Inputs are environment variables so the gate can be tested without GitHub:
#
#   WORKER=success ADDON=success BACKUP=success bash scripts/ci-gate.sh
set -u
rc=0
for job in WORKER ADDON BACKUP; do
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

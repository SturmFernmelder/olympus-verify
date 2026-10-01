#!/usr/bin/env bash
# scripts/ci-gate.sh must pass only when every job result is exactly "success". Run from the repository root:
#   bash scripts/tests/ci-gate.test.sh
set -u
cd "$(dirname "$0")/../.."
ok=0; n=0
check() { n=$((n + 1)); if [ "$2" -eq 0 ]; then ok=$((ok + 1)); echo "PASS $1"; else echo "FAIL $1"; fi; }
gate() { WORKER="$1" WATCHER="$2" ADDON="$3" bash scripts/ci-gate.sh > /dev/null 2>&1; echo $?; }

check "all three success passes" $([ "$(gate success success success)" -eq 0 ] && echo 0 || echo 1)
for bad in failure cancelled skipped ""; do
  check "worker '$bad' fails" $([ "$(gate "$bad" success success)" -ne 0 ] && echo 0 || echo 1)
  check "watcher '$bad' fails" $([ "$(gate success "$bad" success)" -ne 0 ] && echo 0 || echo 1)
  check "addon '$bad' fails" $([ "$(gate success success "$bad")" -ne 0 ] && echo 0 || echo 1)
done
rc=0; bash scripts/ci-gate.sh > /dev/null 2>&1 || rc=$?
check "no variables at all fails" $([ "$rc" -ne 0 ] && echo 0 || echo 1)
check "'Success' (wrong case) fails: the comparison is exact" $([ "$(gate Success success success)" -ne 0 ] && echo 0 || echo 1)

echo
echo "$ok/$n passed"
[ "$ok" -eq "$n" ]

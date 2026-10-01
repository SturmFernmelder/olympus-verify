#!/usr/bin/env bash
# The publication helpers (Codex's V4 candidate, integrated 1 Oct 2026; docs/source-provenance.md): the six V4 files are
# present (five Python helpers and the pinned JSON reference); six Python files compile (the five V4 helpers and the
# reconciliation helper); four CLI helpers answer --help without touching any repository (publication_audit,
# stage_publication, validate_publication, reconcile_public_root); and the asset gate loads its pinned JSON reference. The
# canonical fixture tests (local Git fixtures, hundreds of checks) stay with the candidate; this is the smoke test CI runs.
set -euo pipefail
cd "$(dirname "$0")/../.."
fail() { echo "FAIL $1" >&2; exit 1; }
# the newest interpreter on PATH that is at least 3.12 (Path.is_junction), else whatever there is (compile-only then)
PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)' 2>/dev/null; then PY="$c"; break; fi
done
[ -n "$PY" ] || PY="$(command -v python3 || command -v python)" || fail "no python"
for f in publication_audit public_history official_assets stage_publication validate_publication reconcile_public_root; do
  [ -f "scripts/$f.py" ] || fail "scripts/$f.py is missing"
  "$PY" -m py_compile "scripts/$f.py" || fail "scripts/$f.py does not compile"
done
# Codex's Pages reconciliation successor (v2, 1 Oct 2026): the helper pins the six V4 files and its own network guard by SHA-256 before it imports anything
[ -f scripts/pages_network_guard.cjs ] || fail "the network guard is missing"
[ "$(sha256sum scripts/pages_network_guard.cjs | cut -c1-64)" = "58d40e687a62d1a43bf8eabb90a9431ce84994db1e810651a919dc9b58ab4f13" ] || fail "the network guard is not the reviewed bytes"
node --check scripts/pages_network_guard.cjs || fail "the network guard does not parse"
[ -f scripts/official_asset_reference.json ] || fail "the pinned reference is missing"
for f in publication_audit stage_publication validate_publication; do
  "$PY" "scripts/$f.py" --help >/dev/null || fail "scripts/$f.py --help"
done
# the reconciliation helper needs Python 3.12 (Path.is_junction) even for --help, since it verifies its pins at import
if "$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)'; then "$PY" scripts/reconcile_public_root.py --help >/dev/null || fail "scripts/reconcile_public_root.py --help (a pin mismatch?)"; fi
# the helpers need Python 3.12 or later at run time (Path.is_junction); CI's runner has it, an older local interpreter only compiles them
if "$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)'; then
"$PY" - <<'PY' || fail "the asset gate does not load its pinned reference"
import sys
sys.path.insert(0, "scripts")
import official_assets
ref = official_assets.reference()
assert len(ref["official_paths"]) == 94, len(ref["official_paths"])
assert ref["approved_extractor"]["path"] == "tools/build-site-assets.py"
assert ref["provenance_path"] == "worker/public/static/wow/asset-provenance.json"
assert set(ref["required_documents"]) == {"LICENSE", "README.md", "CLAUDE.md", "THIRD_PARTY_NOTICES.md", "docs/source-provenance.md", "docs/design.md", "docs/deploy-checklist.md"}
PY
else
  echo "SKIP the reference load: this interpreter is older than Python 3.12 (CI runs it)"
fi
for d in LICENSE README.md CLAUDE.md THIRD_PARTY_NOTICES.md docs/source-provenance.md docs/design.md docs/deploy-checklist.md; do
  [ -f "$d" ] || fail "required document $d is missing"
done
echo "PASS publication helpers (six Python files compile, four CLI helpers answer --help, the pins and the pinned JSON reference load, the seven documents exist)"

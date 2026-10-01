#!/usr/bin/env bash
# The argument contract of scripts/deploy-commit.sh (Codex review of 6de12d2): a fake `npx` on PATH records what would
# have reached wrangler, so the accepted forms can be checked and every refused form shown to stop before wrangler.
# Run from the repository root:  bash scripts/tests/deploy-commit.test.sh
set -u
cd "$(dirname "$0")/../.."
here="$(pwd -P)"
fake="$(mktemp -d)"
# The same guard as the script under test: only ever remove a directory we just made inside the temp base.
base="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
fake="$(cd "$fake" && pwd -P)"
case "$fake" in
  "$base"/tmp.*) ;;
  *) echo "refusing: temp dir $fake is not inside $base" >&2; exit 1 ;;
esac
trap 'rm -rf -- "$fake"' EXIT
cat > "$fake/npx" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_LOG"
exit 0
EOF
chmod +x "$fake/npx"
export FAKE_LOG="$fake/calls.log"
export PATH="$fake:$PATH"
ok=0; n=0
check() { n=$((n + 1)); if [ "$2" -eq 0 ]; then ok=$((ok + 1)); echo "PASS $1"; else echo "FAIL $1"; fi; }
calls() { [ -f "$FAKE_LOG" ] && wc -l < "$FAKE_LOG" || echo 0; }
run() { : > "$FAKE_LOG"; env -u CLOUDFLARE_ENV bash scripts/deploy-commit.sh "$@" > "$fake/out" 2> "$fake/err"; echo $?; }
sha="$(git rev-parse HEAD)"

rc="$(run HEAD --dry-run)"
check "HEAD --dry-run is accepted and reaches wrangler once" $([ "$rc" -eq 0 ] && [ "$(calls)" -eq 1 ] && echo 0 || echo 1)
check "  with deploy --config <export>/worker/wrangler.toml --dry-run and nothing else" $(grep -Eq '^--no-install wrangler deploy --config .*/worker/wrangler\.toml --dry-run$' "$FAKE_LOG" && echo 0 || echo 1)
check "  and names the exact SHA" $(grep -q "Deploying commit $sha" "$fake/out" && echo 0 || echo 1)

rc="$(run HEAD --dry-run --outdir "$fake/bundle")"
check "--outdir <dir> after --dry-run is passed on" $([ "$rc" -eq 0 ] && grep -Eq -- "--dry-run --outdir $fake/bundle\$" "$FAKE_LOG" && echo 0 || echo 1)
rc="$(run HEAD --outdir="$fake/bundle" --dry-run)"
check "--outdir=<dir> works too, in either order" $([ "$rc" -eq 0 ] && grep -Eq -- "--dry-run --outdir $fake/bundle\$" "$FAKE_LOG" && echo 0 || echo 1)

for bad in "--config other.toml" "--config=other.toml" "-c other.toml" "--name other" "--name=other" "--env privatetest" "--env=privatetest" "-e privatetest" "--minify" "extra"; do
  # shellcheck disable=SC2086
  rc="$(run HEAD --dry-run $bad)"
  check "'$bad' is refused before wrangler runs" $([ "$rc" -ne 0 ] && [ "$(calls)" -eq 0 ] && grep -q refusing "$fake/err" && echo 0 || echo 1)
done
rc="$(run HEAD --outdir "$fake/bundle")"
check "--outdir without --dry-run is refused" $([ "$rc" -ne 0 ] && [ "$(calls)" -eq 0 ] && echo 0 || echo 1)
rc="$(run HEAD --dry-run --outdir)"
check "--outdir without a directory is refused" $([ "$rc" -ne 0 ] && [ "$(calls)" -eq 0 ] && echo 0 || echo 1)
rc="$(run)"
check "no commit is a usage error" $([ "$rc" -ne 0 ] && [ "$(calls)" -eq 0 ] && echo 0 || echo 1)
rc="$(run --dry-run)"
check "an option where the commit should be is a usage error" $([ "$rc" -ne 0 ] && [ "$(calls)" -eq 0 ] && echo 0 || echo 1)
rc="$(run no-such-commit --dry-run)"
check "an unknown commit is refused by git before anything is exported" $([ "$rc" -ne 0 ] && [ "$(calls)" -eq 0 ] && echo 0 || echo 1)
: > "$FAKE_LOG"; CLOUDFLARE_ENV=privatetest bash scripts/deploy-commit.sh HEAD --dry-run > "$fake/out" 2> "$fake/err"; rc=$?
check "CLOUDFLARE_ENV in the environment is refused" $([ "$rc" -ne 0 ] && [ "$(calls)" -eq 0 ] && grep -q CLOUDFLARE_ENV "$fake/err" && echo 0 || echo 1)

echo
echo "$ok/$n passed"
[ "$ok" -eq "$n" ]

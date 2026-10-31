#!/usr/bin/env bash
# The argument contract of scripts/deploy-commit.sh (Codex review of 6de12d2): a fake `node` on PATH records the fixed CLI after the real profile check, before it would
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
export REAL_NODE="$(command -v node)"
cat > "$fake/node" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in *wrangler-dist*cli.js) shift ;; *) exec "$REAL_NODE" "$@" ;; esac
printf '%s\n' "--no-install wrangler $*" >> "$FAKE_LOG"
printf '%s\n' "$@" > "$FAKE_ARGV"
for (( i=1; i<=$#; i++ )); do
  if [ "${!i}" = --config ]; then
    i=$((i + 1)); cp -- "${!i}" "$FAKE_CONFIG"; break
  fi
done
exit 0
EOF
chmod +x "$fake/node"
export FAKE_LOG="$fake/calls.log"
export FAKE_ARGV="$fake/argv.log"
export FAKE_CONFIG="$fake/exported-config.toml"
export PATH="$fake:$PATH"
ok=0; n=0
check() { n=$((n + 1)); if [ "$2" -eq 0 ]; then ok=$((ok + 1)); echo "PASS $1"; else echo "FAIL $1"; fi; }
calls() { [ -f "$FAKE_LOG" ] && wc -l < "$FAKE_LOG" || echo 0; }
run() { : > "$FAKE_LOG"; env -u CLOUDFLARE_ENV -u WRANGLER_ENV bash scripts/deploy-commit.sh "$@" > "$fake/out" 2> "$fake/err"; echo $?; }
sha="$(git rev-parse HEAD)"
tree="$(git rev-parse HEAD^{tree})"
bundle="$(printf 'a%.0s' {1..64})"

rc="$(run HEAD --dry-run)"
check "HEAD --dry-run is accepted and reaches wrangler once" $([ "$rc" -eq 0 ] && [ "$(calls)" -eq 1 ] && echo 0 || echo 1)
check "  with deploy --config <export>/worker/wrangler.toml --dry-run and nothing else" $(grep -Eq '^--no-install wrangler deploy --config .*/worker/wrangler\.toml --dry-run$' "$FAKE_LOG" && echo 0 || echo 1)
check "  and names the exact SHA" $(grep -q "Deploying commit $sha" "$fake/out" && echo 0 || echo 1)

rc="$(run HEAD --dry-run --outdir "$fake/bundle")"
check "--outdir <dir> after --dry-run is passed on" $([ "$rc" -eq 0 ] && grep -Eq -- "--dry-run --outdir $fake/bundle\$" "$FAKE_LOG" && echo 0 || echo 1)
rc="$(run HEAD --dry-run --keep-vars)"
check "main --keep-vars is accepted once and preserves the exact archive selector" $([ "$rc" -eq 0 ] && [ "$(calls)" -eq 1 ] && [ "$(grep -c '^--keep-vars$' "$FAKE_ARGV")" -eq 1 ] && grep -Fq '/worker/wrangler.toml' "$FAKE_ARGV" && echo 0 || echo 1)
rc="$(run HEAD --keep-vars --target main --dry-run --tag "$tree" --message "$bundle" --bind-source-tree)"
check "main keep-vars composes with its exact tree annotations and derived serving binding" $([ "$rc" -eq 0 ] && [ "$(calls)" -eq 1 ] && [ "$(grep -c '^--keep-vars$' "$FAKE_ARGV")" -eq 1 ] && grep -Fxq "PRIVACY_SERVING_SOURCE_TREE:$tree" "$FAKE_ARGV" && echo 0 || echo 1)
for bad in '--keep-vars --keep-vars' '--keep-vars=true' '--target privacy-floor --keep-vars' '--keep-vars --target privacy-operator' '--target privacy-successor --keep-vars'; do
  # Deliberate token lists, never evaluated as shell code.
  # shellcheck disable=SC2086
  rc="$(run HEAD --dry-run $bad)"
  check "'$bad' is refused before wrangler runs" $([ "$rc" -ne 0 ] && [ "$(calls)" -eq 0 ] && grep -q refusing "$fake/err" && echo 0 || echo 1)
done
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
: > "$FAKE_LOG"; WRANGLER_ENV=privatetest bash scripts/deploy-commit.sh HEAD --dry-run > "$fake/out" 2> "$fake/err"; rc=$?
check "WRANGLER_ENV in the environment is refused" $([ "$rc" -ne 0 ] && [ "$(calls)" -eq 0 ] && grep -q WRANGLER_ENV "$fake/err" && echo 0 || echo 1)

for spec in 'main:wrangler.toml' 'privacy-floor:wrangler.privacy-floor.private.toml' 'privacy-evidence:wrangler.privacy-release-evidence.private.toml' 'privacy-initializer:wrangler.privacy-initializer.private.toml' 'privacy-operator:wrangler.privacy-operator.private.toml' 'privacy-successor:wrangler.privacy-successor.private.toml'; do
  target="${spec%%:*}"; config="${spec#*:}"
  rc="$(run HEAD --dry-run --target "$target")"
  git show "HEAD:worker/$config" > "$fake/expected.toml"
  check "$target selects exactly its archived configuration" $([ "$rc" -eq 0 ] && [ "$(calls)" -eq 1 ] && grep -Fq "/worker/$config" "$FAKE_ARGV" && cmp -s "$fake/expected.toml" "$FAKE_CONFIG" && echo 0 || echo 1)
done

rc="$(run HEAD --dry-run --tag "$tree" --message "$bundle")"
check "exact tree and bundle annotation pair reaches wrangler" $([ "$rc" -eq 0 ] && [ "$(calls)" -eq 1 ] && grep -Fq -- "--tag $tree --message $bundle" "$FAKE_LOG" && echo 0 || echo 1)
rc="$(run HEAD --message "$bundle" --bind-source-tree --tag "$tree" --dry-run)"
check "main derives only the serving source tree, in either argument order" $([ "$rc" -eq 0 ] && grep -Fxq "PRIVACY_SERVING_SOURCE_TREE:$tree" "$FAKE_ARGV" && [ "$(grep -c '^--var$' "$FAKE_ARGV")" -eq 1 ] && echo 0 || echo 1)
for target in privacy-initializer privacy-operator; do
  rc="$(run HEAD --dry-run --target "$target" --bind-source-tree)"
  check "$target derives only its control source tree" $([ "$rc" -eq 0 ] && grep -Fxq "PRIVACY_CONTROL_SOURCE_TREE:$tree" "$FAKE_ARGV" && [ "$(grep -c '^--var$' "$FAKE_ARGV")" -eq 1 ] && echo 0 || echo 1)
done
rc="$(run HEAD --dry-run --target privacy-successor --bind-source-tree)"
check "privacy-successor derives only its successor control source tree" $([ "$rc" -eq 0 ] && grep -Fxq "PRIVACY_SUCCESSOR_CONTROL_SOURCE_TREE:$tree" "$FAKE_ARGV" && [ "$(grep -c '^--var$' "$FAKE_ARGV")" -eq 1 ] && echo 0 || echo 1)

for bad in '--target' '--target unknown' '--target ../wrangler.toml' '--target main --target main' '--tag' '--tag abc' '--message' '--message abc' "--tag $tree" "--message $bundle" "--tag $(printf '0%.0s' {1..40}) --message $bundle" "--tag $tree --tag $tree --message $bundle" "--tag $tree --message $bundle --message $bundle" '--bind-source-tree' '--target privacy-floor --bind-source-tree' '--target privacy-evidence --bind-source-tree' '--target privacy-initializer --bind-source-tree --bind-source-tree' "--tag $tree --message $bundle --var DISCORD_BOT_TOKEN:other"; do
  # Each case is a deliberate token list, not shell code. No eval or provider invocation.
  # shellcheck disable=SC2086
  rc="$(run HEAD --dry-run $bad)"
  check "'$bad' is refused before wrangler runs" $([ "$rc" -ne 0 ] && [ "$(calls)" -eq 0 ] && grep -q refusing "$fake/err" && echo 0 || echo 1)
done

echo
echo "$ok/$n passed"
[ "$ok" -eq "$n" ]

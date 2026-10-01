#!/usr/bin/env bash
# scripts/cutover-config.sh's permanent contract, valid for BOTH committed states (.84, Codex's review of .81, 06:04 UTC):
# the real --check passes on whatever the repository holds, and the state it found is asserted (the marker present: the
# live file byte-identical to the profile and the plain run announcing the applied state; the marker absent: the host
# route difference shown and no marker). The lifecycle (a partial application, identical files without the marker, the
# real --apply, --check before and after its commit, a second apply refused, the profile or the live file edited after
# the apply, a marker without a hash) runs in a synthetic owned repository whose pre-cutover pair this test BUILDS from
# the expected keys, so it never depends on which state the repository is in. .77/.81/.84, 1 Oct 2026.
set -euo pipefail
cd "$(dirname "$0")/../.."
fail() { echo "FAIL $1" >&2; exit 1; }
script="scripts/cutover-config.sh"

# ---- the permanent contract on the committed repository, in whichever of the two states it is
contract() {
  bash "$script" --check >/dev/null || fail "--check should pass on the committed state ($1)"
  ! bash "$script" --bogus >/dev/null 2>&1 || fail "an unknown argument should be refused ($1)"
  ! bash "$script" --check extra >/dev/null 2>&1 || fail "extra arguments should be refused ($1)"
  if [ -f worker/wrangler.cutover.applied ]; then
    cmp -s worker/wrangler.toml worker/wrangler.cutover.toml || fail "applied state: the live file must be byte-identical to the profile ($1)"
    bash "$script" | grep -q 'applied state' || fail "applied state: the plain run should announce it ($1)"
    ! bash "$script" --apply >/dev/null 2>&1 || fail "applied state: a second --apply must be refused ($1)"
  else
    bash "$script" | grep -q 'SITE_HOST' || fail "pre-cutover state: the plain run should show the site host difference ($1)"
    if cmp -s worker/wrangler.toml worker/wrangler.cutover.toml; then fail "pre-cutover state: the files must differ ($1)"; fi
  fi
}
contract "repository"

# ---- the lifecycle, in a synthetic owned repository built from the expected keys (independent of the repository's state)
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/scripts" "$tmp/worker"
cp "$script" "$tmp/scripts/"
expected="GUILD_ID ROLE_GUILD_MEMBER ROLE_OFFICER ROLE_MODERATOR ROLE_GUILD_LEADER ROLE_GUILD_MASTER ROLE_RAID_LEADER CHANNEL_RECRUITMENT_REVIEW CHANNEL_MOD_ALERTS CHANNEL_SERVER_LOG SET_NICKNAME CHANNEL_NOTICES BLOCKING_ROLE_IDS CHANNEL_VISITOR_CHAT SITE_HOST SITE_LEGACY_HOSTS"
build() { # $1 = old|new
  local f="$tmp/worker/$2" v
  {
    echo 'name = "olympus-verify"'
    echo 'main = "src/index.ts"'
    if [ "$1" = old ]; then echo 'routes = [{ pattern = "guild.example", custom_domain = true }]'; else echo 'routes = [{ pattern = "olympus.example", custom_domain = true }, { pattern = "guild.example", custom_domain = true }]  # both hosts'; fi
    echo '[vars]'
    for k in $expected; do echo "$k = \"$1-$k\"  # comment"; done
    echo 'UNRELATED = "same"'
    echo 'ROSTER_MIN_MEMBERS = "800"'
  } > "$f"
}
build old wrangler.toml
build new wrangler.cutover.toml
( cd "$tmp" && git init -q && git config core.autocrlf false && git -c user.name=t -c user.email=t@example.invalid add -A && git -c user.name=t -c user.email=t@example.invalid commit -qm pair )
run() { ( cd "$tmp" && bash scripts/cutover-config.sh "$@" ); }
synthetic_contract() { ( cd "$tmp" && script="scripts/cutover-config.sh" && contract "synthetic $1" ); }
run --check >/dev/null || fail "the synthetic pair should pass --check"
synthetic_contract "pair"
# a partial application (one key copied by hand) is neither state
( cd "$tmp" && sed -i 's/^GUILD_ID = "old-GUILD_ID"/GUILD_ID = "new-GUILD_ID"/' worker/wrangler.toml )
! run --check >/dev/null 2>&1 || fail "a partial application should fail --check"
! run --apply >/dev/null 2>&1 || fail "--apply should refuse a dirty live file"
( cd "$tmp" && git checkout -q -- worker/wrangler.toml )
# identical files without the marker are not an approval
( cd "$tmp" && cp worker/wrangler.cutover.toml worker/wrangler.toml )
! run --check >/dev/null 2>&1 || fail "identical files without the marker should fail --check"
( cd "$tmp" && git checkout -q -- worker/wrangler.toml )
# the real apply, then the permanent contract before and after its commit
run --apply >/dev/null || fail "--apply should succeed on a clean committed pair"
[ -f "$tmp/worker/wrangler.cutover.applied" ] || fail "--apply should write the activation marker"
cmp -s "$tmp/worker/wrangler.toml" "$tmp/worker/wrangler.cutover.toml" || fail "--apply should make the live file the profile"
synthetic_contract "applied, uncommitted"
( cd "$tmp" && git -c user.name=t -c user.email=t@example.invalid add -A && git -c user.name=t -c user.email=t@example.invalid commit -qm cutover )
synthetic_contract "applied, committed"
# the profile edited after the apply: the marker no longer matches
( cd "$tmp" && sed -i 's/^ROSTER_MIN_MEMBERS = "800"/ROSTER_MIN_MEMBERS = "1"/' worker/wrangler.cutover.toml )
! run --check >/dev/null 2>&1 || fail "a profile edited after the apply should fail --check"
( cd "$tmp" && git checkout -q -- worker/wrangler.cutover.toml )
# the live file drifted after the apply
( cd "$tmp" && sed -i 's/^ROSTER_MIN_MEMBERS = "800"/ROSTER_MIN_MEMBERS = "1"/' worker/wrangler.toml )
! run --check >/dev/null 2>&1 || fail "a live file drifted after the apply should fail --check"
( cd "$tmp" && git checkout -q -- worker/wrangler.toml )
# a marker without a hash
( cd "$tmp" && printf 'applied_at = "x"\n' > worker/wrangler.cutover.applied )
! run --check >/dev/null 2>&1 || fail "a marker without the profile hash should fail --check"
( cd "$tmp" && git checkout -q -- worker/wrangler.cutover.applied )
synthetic_contract "restored"
echo "PASS cutover-config.sh contract (the committed state, and the lifecycle in a synthetic pair)"

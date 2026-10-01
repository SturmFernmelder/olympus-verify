#!/usr/bin/env bash
# The cutover configuration (worker/wrangler.cutover.toml: Asmongold's server, its Olympus roles and channels, the
# preferred site host) is kept beside the live worker/wrangler.toml, which every deploy of main ships, so that a deploy
# before the cutover still serves the current server. .77, 1 Oct 2026; .81: the two states (Codex's review, 05:41 UTC).
#
# Two committed states are valid, and --check tells them apart by the activation marker worker/wrangler.cutover.applied:
#   * no marker: the reviewed PRE-CUTOVER pair; the two files differ in exactly the expected keys and the host routes.
#     Two identical files without the marker FAIL: equal files are never an implicit approval, applying goes through
#     --apply.
#   * the marker: the APPLIED final state; the live file is byte-identical to the profile AND the profile's SHA-256 is
#     the one the marker recorded at the apply, so an edit of either file after the apply fails the check and forces a
#     re-review (and a re-apply).
#
#   bash scripts/cutover-config.sh            # show the variables and routes that differ (comments ignored)
#   bash scripts/cutover-config.sh --check    # exit 0 when the committed state is one of the two valid ones (CI runs this)
#   bash scripts/cutover-config.sh --apply    # the final authorized cutover step, after the gates in docs/deploy-checklist.md
#                                             # "Worker .77": copy the profile over worker/wrangler.toml and write the marker
#                                             # (the live file must be committed clean); then commit, both agents sign that
#                                             # exact commit, and Viktor deploys it (never an uncommitted override)
set -euo pipefail
cd "$(dirname "$0")/.."
live="worker/wrangler.toml"
cut="worker/wrangler.cutover.toml"
marker="worker/wrangler.cutover.applied"
[ -f "$live" ] && [ -f "$cut" ] || { echo "refusing: $live or $cut is missing" >&2; exit 1; }
usage() { echo "usage: scripts/cutover-config.sh [--check|--apply]" >&2; exit 1; }
digest() { sha256sum "$1" | cut -c1-64; }
# the files without comments and blank lines: what wrangler actually reads
strip() { sed -e 's/[[:space:]]*#.*$//' -e '/^[[:space:]]*$/d' "$1"; }
expected="routes GUILD_ID ROLE_GUILD_MEMBER ROLE_OFFICER ROLE_MODERATOR ROLE_GUILD_LEADER ROLE_GUILD_MASTER ROLE_RAID_LEADER CHANNEL_RECRUITMENT_REVIEW CHANNEL_MOD_ALERTS CHANNEL_SERVER_LOG SET_NICKNAME CHANNEL_NOTICES BLOCKING_ROLE_IDS CHANNEL_VISITOR_CHAT SITE_HOST SITE_LEGACY_HOSTS"
changed="$( (diff <(strip "$live") <(strip "$cut") || true) | sed -n 's/^[<>][[:space:]]*\([A-Za-z_][A-Za-z0-9_]*\)[[:space:]]*=.*/\1/p' | sort -u | tr '\n' ' ')"
other="$( (diff <(strip "$live") <(strip "$cut") || true) | grep -E '^[<>]' | grep -Ev '^[<>][[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=' || true)"
check_pair() {
  if cmp -s "$live" "$cut"; then echo "refusing: $live and $cut are identical without the activation marker $marker; the cutover is applied only through --apply" >&2; return 1; fi
  [ -z "$other" ] || { echo "unexpected difference outside a key = value line:" >&2; echo "$other" >&2; return 1; }
  for k in $changed; do case " $expected " in *" $k "*) ;; *) echo "unexpected difference: $k" >&2; return 1 ;; esac; done
  for k in $expected; do case " $changed " in *" $k "*) ;; *) echo "expected difference missing: $k" >&2; return 1 ;; esac; done
  echo "ok (pre-cutover): $cut differs from $live in exactly the expected keys ($(echo "$changed" | wc -w | tr -d ' '))"
}
check_applied() {
  local recorded
  recorded="$(sed -n 's/^profile_sha256 = "\([0-9a-f]\{64\}\)"$/\1/p' "$marker" | head -n 1)"
  [ -n "$recorded" ] || { echo "refusing: $marker carries no profile_sha256" >&2; return 1; }
  [ "$(digest "$cut")" = "$recorded" ] || { echo "refusing: $cut changed after the apply the marker records (re-review, then --apply again)" >&2; return 1; }
  cmp -s "$live" "$cut" || { echo "refusing: $marker exists but $live is not byte-identical to $cut (a drifted or partial configuration)" >&2; return 1; }
  echo "ok (applied): $live is the reviewed cutover profile the marker records ($recorded)"
}
check() { if [ -f "$marker" ]; then check_applied; else check_pair; fi; }
case "${1:-}" in
  "") [ "$#" -eq 0 ] || usage; if [ -f "$marker" ]; then echo "applied state (marker present); the files should be identical:"; fi; diff <(strip "$live") <(strip "$cut") || true ;;
  --check) [ "$#" -eq 1 ] || usage; check ;;
  --apply)
    [ "$#" -eq 1 ] || usage
    [ ! -f "$marker" ] || { echo "refusing: $marker exists; the cutover configuration is already applied (remove the marker and re-review to apply a changed profile)" >&2; exit 1; }
    check_pair
    [ -z "$(git status --porcelain -- "$live" "$marker")" ] || { echo "refusing: $live or $marker has uncommitted changes" >&2; exit 1; }
    cp "$cut" "$live"
    printf '# The cutover configuration was applied (scripts/cutover-config.sh --apply): worker/wrangler.toml is byte-identical to the\n# reviewed worker/wrangler.cutover.toml whose SHA-256 is recorded here; --check binds both files to it from now on.\nprofile_sha256 = "%s"\napplied_at = "%s"\n' "$(digest "$cut")" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$marker"
    echo "applied: $live is now the cutover configuration and $marker records the profile. Commit both, have both agents sign that exact commit, then bash scripts/deploy-commit.sh <sha>." ;;
  *) usage ;;
esac

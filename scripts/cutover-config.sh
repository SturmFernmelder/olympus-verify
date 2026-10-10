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
#     the one the marker records last, so an edit of either file after that fails the check and forces a re-review.
#
# After the cutover, the community features are switched on (docs/launch-runbook.md step 4) only by --activate: the
# profile may then differ from the live file in the reviewed activation keys and nothing else (the community switches
# and lifetimes, .130's explicit organizer announcement switch, and gate 6's VERIFY_OPEN_SINCE, which only moves forward: one real calendar day written YYYY-MM-DD,
# strictly later than the live one, never earlier, empty, malformed or removed); --activate copies it over the live file
# and APPENDS an activation record to the marker. The marker has one grammar, read line by line: comment
# lines (starting with #) anywhere; otherwise exactly one cutover record, profile_sha256 = "<64 hex>" then
# applied_at = "<YYYY-MM-DDTHH:MM:SSZ>", followed by zero or more complete activation records,
# activation_profile_sha256 = "<64 hex>" then activated_at = "<YYYY-MM-DDTHH:MM:SSZ>", each time no earlier than the one
# before. Any other line (unknown, malformed, blank, a partial or out-of-order record) refuses. The cutover's own record is
# never rewritten and the marker is never removed. (Codex's reviews, 1 Oct 2026.)
#
#   bash scripts/cutover-config.sh            # show the variables and routes that differ (comments ignored)
#   bash scripts/cutover-config.sh --check    # exit 0 when the committed state is one of the two valid ones (CI runs this)
#   bash scripts/cutover-config.sh --apply    # the final authorized cutover step, after the gates in docs/deploy-checklist.md
#                                             # "Worker .77": copy the profile over worker/wrangler.toml and write the marker
#                                             # (the live file must be committed clean); then commit, both agents sign that
#                                             # exact commit, and Viktor deploys it (never an uncommitted override)
#   bash scripts/cutover-config.sh --activate # after the cutover: the reviewed activation-key change in the profile copied
#                                             # over the live file, one record appended to the marker; commit, sign, deploy
set -euo pipefail
cd "$(dirname "$0")/.."
live="worker/wrangler.toml"
cut="worker/wrangler.cutover.toml"
marker="worker/wrangler.cutover.applied"
[ -f "$live" ] && [ -f "$cut" ] || { echo "refusing: $live or $cut is missing" >&2; exit 1; }
usage() { echo "usage: scripts/cutover-config.sh [--check|--apply|--activate]" >&2; exit 1; }
digest() { sha256sum "$1" | cut -c1-64; }
# the files without comments and blank lines: what wrangler actually reads
strip() { sed -e 's/[[:space:]]*#.*$//' -e '/^[[:space:]]*$/d' "$1"; }
# the only keys --activate may change after the cutover: the community switches and their lifetimes, and gate 6's
# VERIFY_OPEN_SINCE, forward only (forward_date below; Codex's review of the first activation, 1 Oct 2026 23:14 UTC)
activation="COMMUNITY_FEATURES CONTRIBUTIONS_MODE CONTRIBUTIONS_RETENTION_DAYS PRIVACY_INTAKE_ENABLED PRIVACY_INTAKE_MONITORED PRIVACY_INTAKE_RETENTION_DAYS OFFICER_DIGEST_ENABLED VERIFY_OPEN_SINCE EVENT_DISCORD_DELIVERY"
expected="routes GUILD_ID ROLE_GUILD_MEMBER ROLE_OFFICER ROLE_MODERATOR ROLE_GUILD_LEADER ROLE_GUILD_MASTER ROLE_RAID_LEADER CHANNEL_RECRUITMENT_REVIEW CHANNEL_MOD_ALERTS CHANNEL_SERVER_LOG SET_NICKNAME CHANNEL_NOTICES BLOCKING_ROLE_IDS CHANNEL_VISITOR_CHAT SITE_HOST SITE_LEGACY_HOSTS VERIFY_OPEN_SINCE"
changed="$( (diff <(strip "$live") <(strip "$cut") || true) | sed -n 's/^[<>][[:space:]]*\([A-Za-z_][A-Za-z0-9_]*\)[[:space:]]*=.*/\1/p' | sort -u | tr '\n' ' ')"
other="$( (diff <(strip "$live") <(strip "$cut") || true) | grep -E '^[<>]' | grep -Ev '^[<>][[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=' || true)"
check_pair() {
  if cmp -s "$live" "$cut"; then echo "refusing: $live and $cut are identical without the activation marker $marker; the cutover is applied only through --apply" >&2; return 1; fi
  [ -z "$other" ] || { echo "unexpected difference outside a key = value line:" >&2; echo "$other" >&2; return 1; }
  for k in $changed; do case " $expected " in *" $k "*) ;; *) echo "unexpected difference: $k" >&2; return 1 ;; esac; done
  for k in $expected; do case " $changed " in *" $k "*) ;; *) echo "expected difference missing: $k" >&2; return 1 ;; esac; done
  echo "ok (pre-cutover): $cut differs from $live in exactly the expected keys ($(echo "$changed" | wc -w | tr -d ' '))"
}
# Reads the whole marker by its grammar (see the header). Prints "<profile hash in force> <time of the last record>" and
# returns 0, or prints why to stderr and returns 1. Bash's own regular expressions, no awk: the result is the same on the
# Linux CI runner and in Git Bash.
parse_marker() {
  local line state=0 n=0 hash="" pending="" last=""
  local re_p='^profile_sha256 = "([0-9a-f]{64})"$' re_a='^applied_at = "([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z)"$'
  local re_x='^activation_profile_sha256 = "([0-9a-f]{64})"$' re_y='^activated_at = "([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z)"$'
  while IFS= read -r line || [ -n "$line" ]; do
    n=$((n + 1))
    case "$line" in "#"*) continue ;; esac
    case "$state" in
      0) [[ $line =~ $re_p ]] || { echo "refusing: $marker line $n: expected the cutover's profile_sha256 record" >&2; return 1; }
         hash="${BASH_REMATCH[1]}"; state=1 ;;
      1) [[ $line =~ $re_a ]] || { echo "refusing: $marker line $n: expected the cutover's applied_at right after its profile_sha256" >&2; return 1; }
         last="${BASH_REMATCH[1]}"; state=2 ;;
      2) [[ $line =~ $re_x ]] || { echo "refusing: $marker line $n: only a complete activation record may follow (activation_profile_sha256, then activated_at)" >&2; return 1; }
         pending="${BASH_REMATCH[1]}"; state=3 ;;
      3) [[ $line =~ $re_y ]] || { echo "refusing: $marker line $n: expected activated_at right after activation_profile_sha256" >&2; return 1; }
         [[ "${BASH_REMATCH[1]}" < "$last" ]] && { echo "refusing: $marker line $n: activated_at is earlier than the record before it" >&2; return 1; }
         last="${BASH_REMATCH[1]}"; hash="$pending"; state=2 ;;
    esac
  done < "$marker"
  [ "$state" = 2 ] || { echo "refusing: $marker ends inside a record (a partial cutover or activation record)" >&2; return 1; }
  printf '%s %s\n' "$hash" "$last"
}
# One real calendar day written YYYY-MM-DD (Gregorian leap years); not a time of day, not unix seconds.
calendar_day() {
  local re='^([0-9]{4})-([0-9]{2})-([0-9]{2})$' y m d max
  [[ $1 =~ $re ]] || return 1
  y=$((10#${BASH_REMATCH[1]})); m=$((10#${BASH_REMATCH[2]})); d=$((10#${BASH_REMATCH[3]}))
  case "$m" in
    1|3|5|7|8|10|12) max=31 ;;
    4|6|9|11) max=30 ;;
    2) if (( (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 )); then max=29; else max=28; fi ;;
    *) return 1 ;;
  esac
  (( d >= 1 && d <= max ))
}
# VERIFY_OPEN_SINCE as wrangler reads it from a file: exactly one KEY = "value" line (comments ignored), else status 1.
open_since() {
  local lines re='^[[:space:]]*VERIFY_OPEN_SINCE[[:space:]]*=[[:space:]]*"([^"]*)"[[:space:]]*$'
  lines="$(strip "$1" | grep -E '^[[:space:]]*VERIFY_OPEN_SINCE[[:space:]]*=' || true)"
  [ -n "$lines" ] && [ "$(printf '%s\n' "$lines" | wc -l | tr -d ' ')" = 1 ] && [[ $lines =~ $re ]] || return 1
  printf '%s\n' "${BASH_REMATCH[1]}"
}
# Gate 6 after the cutover: the date verification opened for everyone only moves forward, so nobody's grace before a
# removal may be offered (UNVERIFIED_GRACE_DAYS after it) is ever shortened. Checked only when the date is among the
# changed keys; an activation that leaves it alone is not affected.
forward_date() {
  local old new
  old="$(open_since "$live")" && calendar_day "$old" || { echo "refusing: VERIFY_OPEN_SINCE in $live is not one YYYY-MM-DD calendar day, so a forward move cannot be checked" >&2; return 1; }
  new="$(open_since "$cut")" || { echo "refusing: VERIFY_OPEN_SINCE must stay exactly one KEY = \"YYYY-MM-DD\" line in $cut (not removed, doubled or differently quoted)" >&2; return 1; }
  calendar_day "$new" || { echo "refusing: VERIFY_OPEN_SINCE = \"$new\" in $cut is not a real calendar day written YYYY-MM-DD" >&2; return 1; }
  [[ "$new" > "$old" ]] || { echo "refusing: VERIFY_OPEN_SINCE only moves forward after the cutover ($old -> $new is not later)" >&2; return 1; }
}
check_applied() {
  local parsed recorded
  parsed="$(parse_marker)" || return 1
  recorded="${parsed%% *}"
  [ "$(digest "$cut")" = "$recorded" ] || { echo "refusing: $cut changed after the apply or activation the marker records last (re-review, then --activate)" >&2; return 1; }
  cmp -s "$live" "$cut" || { echo "refusing: $marker exists but $live is not byte-identical to $cut (a drifted or partial configuration)" >&2; return 1; }
  echo "ok (applied): $live is the reviewed profile the marker records last ($recorded)"
}
check() { if [ -f "$marker" ]; then check_applied; else check_pair; fi; }
case "${1:-}" in
  "") [ "$#" -eq 0 ] || usage; if [ -f "$marker" ]; then echo "applied state (marker present); the files should be identical:"; fi; diff <(strip "$live") <(strip "$cut") || true ;;
  --check) [ "$#" -eq 1 ] || usage; check ;;
  --apply)
    [ "$#" -eq 1 ] || usage
    [ ! -f "$marker" ] || { echo "refusing: $marker exists; the cutover configuration is already applied (a change of the activation keys goes through --activate; the marker is never removed)" >&2; exit 1; }
    check_pair
    [ -z "$(git status --porcelain -- "$live" "$marker")" ] || { echo "refusing: $live or $marker has uncommitted changes" >&2; exit 1; }
    cp "$cut" "$live"
    printf '# The cutover configuration was applied (scripts/cutover-config.sh --apply): worker/wrangler.toml is byte-identical to the\n# reviewed worker/wrangler.cutover.toml whose SHA-256 is recorded here; --check binds both files to it from now on.\nprofile_sha256 = "%s"\napplied_at = "%s"\n' "$(digest "$cut")" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$marker"
    echo "applied: $live is now the cutover configuration and $marker records the profile. Commit both, have both agents sign that exact commit, then bash scripts/deploy-commit.sh <sha>." ;;
  --activate)
    [ "$#" -eq 1 ] || usage
    [ -f "$marker" ] || { echo "refusing: no $marker; --activate is for after the cutover (--apply comes first)" >&2; exit 1; }
    parsed="$(parse_marker)" || exit 1
    recorded="${parsed%% *}"; last="${parsed#* }"
    [ "$(digest "$live")" = "$recorded" ] || { echo "refusing: $live is not the profile the marker records last (a drifted live file)" >&2; exit 1; }
    [ -z "$(git status --porcelain -- "$live" "$marker")" ] || { echo "refusing: $live or $marker has uncommitted changes" >&2; exit 1; }
    if cmp -s "$live" "$cut"; then echo "refusing: $cut equals $live; there is nothing to activate" >&2; exit 1; fi
    [ -z "$other" ] || { echo "refusing: a difference outside a key = value line:" >&2; echo "$other" >&2; exit 1; }
    [ -n "$changed" ] || { echo "refusing: only comments differ; there is nothing to activate" >&2; exit 1; }
    for k in $changed; do case " $activation " in *" $k "*) ;; *) echo "refusing: $k is not an activation key (only: $activation)" >&2; exit 1 ;; esac; done
    case " $changed " in *" VERIFY_OPEN_SINCE "*) forward_date || exit 1 ;; esac
    now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    [[ "$now" < "$last" ]] && { echo "refusing: the clock ($now) is earlier than the marker's last record ($last)" >&2; exit 1; }
    cp "$cut" "$live"
    printf '# Activation (scripts/cutover-config.sh --activate): only the activation keys changed (%s); this is the profile now in force.\nactivation_profile_sha256 = "%s"\nactivated_at = "%s"\n' "$(echo $changed)" "$(digest "$cut")" "$now" >> "$marker"
    parse_marker >/dev/null || { echo "refusing: the marker no longer parses after the append; restore $live and $marker from the commit" >&2; exit 1; }
    echo "activated: $live now carries $(echo $changed) and $marker records it (the cutover record unchanged). Commit both, have both agents sign that exact commit, then deploy its shipping commit." ;;
  *) usage ;;
esac

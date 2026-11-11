#!/usr/bin/env bash
# Deploy an exact committed snapshot of the Worker, never the working folder: with two agents editing the same tree,
# `npm run deploy` from worker/ would upload whatever is on disk, half-edited files and .bak siblings in public/
# included. This exports <commit> with `git archive` into a temp directory and runs the project's own wrangler
# against that copy's worker/wrangler.toml, so src/ and public/ come only from the commit.
#
#   bash scripts/deploy-commit.sh <commit> --keep-vars              # main rollout; retain dashboard-only plain vars
#   bash scripts/deploy-commit.sh <commit> --dry-run [--outdir <dir>]   # bundle only, nothing uploaded
#   bash scripts/deploy-commit.sh <commit> --target privacy-floor    # a fixed private service from the same archive
#   bash scripts/deploy-commit.sh <commit> --tag <tree> --message <bundle-sha256> --bind-source-tree
#   bash scripts/deploy-commit.sh <commit> --keep-vars --tag <tree> --message <bundle-sha256> --shared-member230-mode close-only
#   bash scripts/deploy-commit.sh <commit> --keep-vars --tag <tree> --message <bundle-sha256> --shared-member230-mode enabled --shared-member230-closure <ordinary-file>
#
# Targets select only the five checked-in configurations below; no caller config, name, environment or arbitrary
# variable is accepted. Source-tree bindings are derived from the selected commit, never embedded in their own
# tracked tree. The tag/message pair is evidence metadata, not proof of uploaded bundle bytes.
set -euo pipefail
cd "$(dirname "$0")/.."
commit="${1:-}"
case "$commit" in
  ""|-*) echo "usage: scripts/deploy-commit.sh <commit> [--target <fixed-target>] [--dry-run] [--outdir <dir>] [--tag <tree> --message <bundle-sha256>] [--bind-source-tree] [--keep-vars (main/operator/successor)]" >&2; exit 1 ;;
esac
shift
[ -z "${CLOUDFLARE_ENV:-}" ] || { echo "refusing: CLOUDFLARE_ENV is set; this project has no environments" >&2; exit 1; }
[ -z "${WRANGLER_ENV:-}" ] || { echo "refusing: WRANGLER_ENV is set; this project has no environments" >&2; exit 1; }
dry_run=""
outdir=""
target="main"
target_seen=""
tag=""
message=""
bind_source_tree=""
keep_vars=""
shared_member230_mode=""
shared_member230_closure=""
shared_member230_recovery=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) dry_run=1; shift ;;
    --keep-vars)
      [ -z "$keep_vars" ] || { echo "refusing: --keep-vars cannot repeat" >&2; exit 1; }
      keep_vars=1; shift ;;
    --target)
      [ -z "$target_seen" ] && [ -n "${2:-}" ] || { echo "refusing: --target needs one fixed target and cannot repeat" >&2; exit 1; }
      target="$2"; target_seen=1; shift 2 ;;
    --tag)
      [ -z "$tag" ] && [[ "${2:-}" =~ ^[0-9a-f]{40}$ ]] || { echo "refusing: --tag needs one lowercase tree hash and cannot repeat" >&2; exit 1; }
      tag="$2"; shift 2 ;;
    --message)
      [ -z "$message" ] && [[ "${2:-}" =~ ^[0-9a-f]{64}$ ]] || { echo "refusing: --message needs one lowercase bundle SHA256 and cannot repeat" >&2; exit 1; }
      message="$2"; shift 2 ;;
    --bind-source-tree)
      [ -z "$bind_source_tree" ] || { echo "refusing: --bind-source-tree cannot repeat" >&2; exit 1; }
      bind_source_tree=1; shift ;;
    --shared-member230-mode)
      [ -z "$shared_member230_mode" ] && { [ "${2:-}" = close-only ] || [ "${2:-}" = enabled ]; } || { echo "refusing: --shared-member230-mode needs close-only or enabled and cannot repeat" >&2; exit 1; }
      shared_member230_mode="$2"; shift 2 ;;
    --shared-member230-closure)
      [ -z "$shared_member230_closure" ] && [ -n "${2:-}" ] || { echo "refusing: --shared-member230-closure needs one ordinary file and cannot repeat" >&2; exit 1; }
      case "$2" in -*) echo "refusing: --shared-member230-closure needs an ordinary file" >&2; exit 1 ;; esac
      shared_member230_closure="$2"; shift 2 ;;
    --shared-member230-recovery)
      [ -z "$shared_member230_recovery" ] && [ -n "${2:-}" ] || { echo "refusing: --shared-member230-recovery needs one ordinary plan file and cannot repeat" >&2; exit 1; }
      case "$2" in -*) echo "refusing: --shared-member230-recovery needs an ordinary plan file" >&2; exit 1 ;; esac
      shared_member230_recovery="$2"; shift 2 ;;
    --outdir)
      [ -n "${2:-}" ] || { echo "refusing: --outdir needs a directory" >&2; exit 1; }
      case "$2" in -*) echo "refusing: --outdir needs a directory" >&2; exit 1 ;; esac
      outdir="$2"; shift 2 ;;
    --outdir=*) outdir="${1#--outdir=}"; [ -n "$outdir" ] || { echo "refusing: --outdir needs a directory" >&2; exit 1; }; shift ;;
    *) echo "refusing: unsupported deployment argument (got: $1)" >&2; exit 1 ;;
  esac
done
[ -z "$outdir" ] || [ -n "$dry_run" ] || { echo "refusing: --outdir only makes sense with --dry-run" >&2; exit 1; }
case "$target" in
  main) config="wrangler.toml"; source_binding="PRIVACY_SERVING_SOURCE_TREE" ;;
  privacy-floor) config="wrangler.privacy-floor.private.toml"; source_binding="" ;;
  privacy-evidence) config="wrangler.privacy-release-evidence.private.toml"; source_binding="" ;;
  privacy-initializer) config="wrangler.privacy-initializer.private.toml"; source_binding="PRIVACY_CONTROL_SOURCE_TREE" ;;
  privacy-operator) config="wrangler.privacy-operator.private.toml"; source_binding="PRIVACY_CONTROL_SOURCE_TREE" ;;
  privacy-successor) config="wrangler.privacy-successor.private.toml"; source_binding="PRIVACY_SUCCESSOR_CONTROL_SOURCE_TREE" ;;
  *) echo "refusing: unknown fixed deployment target" >&2; exit 1 ;;
esac
if [ -n "$keep_vars" ]; then
  # .266: compatible private schema readers must retain their existing OFF
  # switches and source/epoch variables while the exact index companion rolls out.
  case "$target" in
    main|privacy-operator|privacy-successor) ;;
    *) echo "refusing: --keep-vars is unsupported for this fixed target" >&2; exit 1 ;;
  esac
fi
if [ -n "$tag" ] || [ -n "$message" ]; then
  [ -n "$tag" ] && [ -n "$message" ] || { echo "refusing: --tag and --message must be supplied together" >&2; exit 1; }
fi
if [ -n "$bind_source_tree" ]; then
  [ -n "$source_binding" ] || { echo "refusing: this target has no source-tree binding" >&2; exit 1; }
  [ "$target" != main ] || [ -n "$tag" ] || { echo "refusing: a main source-tree binding requires the release annotations" >&2; exit 1; }
fi
if [ -n "$shared_member230_mode" ] || [ -n "$shared_member230_closure" ] || [ -n "$shared_member230_recovery" ]; then
  [ "$target" = main ] && [ -n "$shared_member230_mode" ] && [ -n "$keep_vars" ] && [ -n "$tag" ] && [ -n "$message" ] && [ -z "$bind_source_tree" ] || { echo "refusing: shared-member230 requires main, --keep-vars and exact tag/message; no source-tree binding or arbitrary delta" >&2; exit 1; }
  [ "$shared_member230_mode" != enabled ] || [ -n "$shared_member230_closure" ] || { echo "refusing: enabled shared-member230 requires its original closure file" >&2; exit 1; }
  [ -z "$shared_member230_recovery" ] || { [ "$shared_member230_mode" = close-only ] && [ -z "$shared_member230_closure" ]; } || { echo "refusing: shared-member230 recovery is close-only and cannot combine with a closure" >&2; exit 1; }
fi
sha="$(git rev-parse --verify "$commit^{commit}")"
source_tree="$(git rev-parse --verify "$sha^{tree}")"
[ -z "$tag" ] || [ "$tag" = "$source_tree" ] || { echo "refusing: --tag does not equal the selected commit's tree" >&2; exit 1; }
tmp="$(mktemp -d)"
# Only ever clean up a directory we just created inside the system temp base (guard against an empty or unexpected
# path before arming rm -rf).
base="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
tmp="$(cd "$tmp" && pwd -P)"
case "$tmp" in
  "$base"/tmp.*) ;;
  *) echo "refusing: temp dir $tmp is not inside $base" >&2; exit 1 ;;
esac
[ -d "$tmp" ] && [ -z "$(ls -A "$tmp")" ] || { echo "refusing: $tmp is not a fresh empty directory" >&2; exit 1; }
trap 'rm -rf -- "$tmp"' EXIT
git archive "$sha" | tar -x -C "$tmp"
[ -f "$tmp/worker/$config" ] || { echo "refusing: the export has no worker/$config" >&2; exit 1; }
args=(deploy --config "$tmp/worker/$config")
[ -z "$keep_vars" ] || args+=(--keep-vars)
[ -z "$dry_run" ] || args+=(--dry-run)
[ -z "$outdir" ] || args+=(--outdir "$outdir")
[ -z "$tag" ] || args+=(--tag "$tag" --message "$message")
[ -z "$bind_source_tree" ] || args+=(--var "$source_binding:$source_tree")
# The archived profile qualifies the caller's ordinary physical install before any Wrangler process or upload.
# A retired refusal stub, another lock graph or implicit npx resolution cannot supply release authority.
checker="$tmp/scripts/check-deploy-toolchain.cjs"
if [ ! -f "$checker" ]; then
  [ ! -e "$tmp/scripts/deploy-toolchain-profile.json" ] || { echo "refusing: incomplete archived deployment tools" >&2; exit 1; }
  checker="$(pwd -P)/scripts/check-deploy-toolchain.cjs"
fi
cli="$(node "$checker" "$tmp" "$(pwd -P)" "$sha" "$source_tree")"
if [ -n "$shared_member230_mode" ]; then
  shared_checker="$tmp/scripts/check-shared-member230-deploy.cjs"
  [ -f "$shared_checker" ] || { echo "refusing: this archive has no qualified shared-member230 selector" >&2; exit 1; }
  shared_vars="$(node "$shared_checker" "$tmp" "$(pwd -P)" "$sha" "$source_tree" "$shared_member230_mode" "$message" "${shared_member230_closure:---none}" "${shared_member230_recovery:---none}")"
  while IFS= read -r binding; do
    [ -n "$binding" ] || { echo "refusing: empty shared-member230 binding" >&2; exit 1; }
    args+=(--var "$binding")
  done <<< "$shared_vars"
fi
echo "Deploying commit $sha${dry_run:+ (dry run)} from a clean export ($tmp): wrangler ${args[*]}"
( cd worker && node "$cli" "${args[@]}" )

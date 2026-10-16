#!/usr/bin/env bash
# Deploy an exact committed snapshot of the Worker, never the working folder: with two agents editing the same tree,
# `npm run deploy` from worker/ would upload whatever is on disk, half-edited files and .bak siblings in public/
# included. This exports <commit> with `git archive` into a temp directory and runs the project's own wrangler
# against that copy's worker/wrangler.toml, so src/ and public/ come only from the commit.
#
#   bash scripts/deploy-commit.sh <commit>                          # e.g. the SHA both agents signed in the task log
#   bash scripts/deploy-commit.sh <commit> --dry-run [--outdir <dir>]   # bundle only, nothing uploaded
#   bash scripts/deploy-commit.sh <commit> --target privacy-floor    # a fixed private service from the same archive
#   bash scripts/deploy-commit.sh <commit> --tag <tree> --message <bundle-sha256> --bind-source-tree
#
# Targets select only the five checked-in configurations below; no caller config, name, environment or arbitrary
# variable is accepted. Source-tree bindings are derived from the selected commit, never embedded in their own
# tracked tree. The tag/message pair is evidence metadata, not proof of uploaded bundle bytes.
set -euo pipefail
cd "$(dirname "$0")/.."
commit="${1:-}"
case "$commit" in
  ""|-*) echo "usage: scripts/deploy-commit.sh <commit> [--target <fixed-target>] [--dry-run] [--outdir <dir>] [--tag <tree> --message <bundle-sha256>] [--bind-source-tree]" >&2; exit 1 ;;
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
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) dry_run=1; shift ;;
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
  *) echo "refusing: unknown fixed deployment target" >&2; exit 1 ;;
esac
if [ -n "$tag" ] || [ -n "$message" ]; then
  [ -n "$tag" ] && [ -n "$message" ] || { echo "refusing: --tag and --message must be supplied together" >&2; exit 1; }
fi
if [ -n "$bind_source_tree" ]; then
  [ -n "$source_binding" ] || { echo "refusing: this target has no source-tree binding" >&2; exit 1; }
  [ "$target" != main ] || [ -n "$tag" ] || { echo "refusing: a main source-tree binding requires the release annotations" >&2; exit 1; }
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
[ -z "$dry_run" ] || args+=(--dry-run)
[ -z "$outdir" ] || args+=(--outdir "$outdir")
[ -z "$tag" ] || args+=(--tag "$tag" --message "$message")
[ -z "$bind_source_tree" ] || args+=(--var "$source_binding:$source_tree")
echo "Deploying commit $sha${dry_run:+ (dry run)} from a clean export ($tmp): wrangler ${args[*]}"
# The project's wrangler lives in worker/node_modules; --config makes it read main, assets and vars from the export.
( cd worker && npx --no-install wrangler "${args[@]}" )

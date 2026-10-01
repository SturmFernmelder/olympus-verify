#!/usr/bin/env bash
# Deploy an exact committed snapshot of the Worker, never the working folder: with two agents editing the same tree,
# `npm run deploy` from worker/ would upload whatever is on disk, half-edited files and .bak siblings in public/
# included. This exports <commit> with `git archive` into a temp directory and runs the project's own wrangler
# against that copy's worker/wrangler.toml, so src/ and public/ come only from the commit.
#
#   bash scripts/deploy-commit.sh <commit>                          # e.g. the SHA both agents signed in the task log
#   bash scripts/deploy-commit.sh <commit> --dry-run [--outdir <dir>]   # bundle only, nothing uploaded
#
# There is one configuration (no wrangler environments) and one target (the exported commit's worker/wrangler.toml).
# Only --dry-run and --outdir are passed on to wrangler; anything else, in particular another --config, --name, --env
# or CLOUDFLARE_ENV, is refused before wrangler is invoked (Codex review of 6de12d2, 23:37 UTC).
set -euo pipefail
cd "$(dirname "$0")/.."
commit="${1:-}"
case "$commit" in
  ""|-*) echo "usage: scripts/deploy-commit.sh <commit> [--dry-run] [--outdir <dir>]" >&2; exit 1 ;;
esac
shift
[ -z "${CLOUDFLARE_ENV:-}" ] || { echo "refusing: CLOUDFLARE_ENV is set; this project has no environments" >&2; exit 1; }
dry_run=""
outdir=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) dry_run=1; shift ;;
    --outdir)
      [ -n "${2:-}" ] || { echo "refusing: --outdir needs a directory" >&2; exit 1; }
      case "$2" in -*) echo "refusing: --outdir needs a directory" >&2; exit 1 ;; esac
      outdir="$2"; shift 2 ;;
    --outdir=*) outdir="${1#--outdir=}"; [ -n "$outdir" ] || { echo "refusing: --outdir needs a directory" >&2; exit 1; }; shift ;;
    *) echo "refusing: only --dry-run and --outdir <dir> may follow the commit (got: $1)" >&2; exit 1 ;;
  esac
done
[ -z "$outdir" ] || [ -n "$dry_run" ] || { echo "refusing: --outdir only makes sense with --dry-run" >&2; exit 1; }
sha="$(git rev-parse --verify "$commit^{commit}")"
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
[ -f "$tmp/worker/wrangler.toml" ] || { echo "refusing: the export has no worker/wrangler.toml" >&2; exit 1; }
args=(deploy --config "$tmp/worker/wrangler.toml")
[ -z "$dry_run" ] || args+=(--dry-run)
[ -z "$outdir" ] || args+=(--outdir "$outdir")
echo "Deploying commit $sha${dry_run:+ (dry run)} from a clean export ($tmp): wrangler ${args[*]}"
# The project's wrangler lives in worker/node_modules; --config makes it read main, assets and vars from the export.
( cd worker && npx --no-install wrangler "${args[@]}" )

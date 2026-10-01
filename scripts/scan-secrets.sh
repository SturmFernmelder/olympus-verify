#!/usr/bin/env bash
set -euo pipefail

# Official Gitleaks CLI; no third-party Action, scanner service, or upload of source. Pin both the version and the
# published archive digest (the same pin Olympus Forever reviewed on 23 Sep 2026). Fail closed on download or hash
# failure. Update both together after reviewing the official release.
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || {
  printf '%s\n' 'This CI wrapper requires Linux x86_64.' >&2
  exit 2
}
version=8.30.1
archive="gitleaks_${version}_linux_x64.tar.gz"
expected=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
scan_dir="$(mktemp -d)"
trap 'rm -rf -- "$scan_dir"' EXIT
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  "https://github.com/gitleaks/gitleaks/releases/download/v${version}/${archive}" \
  --output "$scan_dir/$archive"
printf '%s  %s\n' "$expected" "$scan_dir/$archive" | sha256sum --check --status
tar -xzf "$scan_dir/$archive" -C "$scan_dir" gitleaks
"$scan_dir/gitleaks" git --config .gitleaks.toml --redact=100 \
  --no-banner --log-level warn --ignore-gitleaks-allow --log-opts='--all' .

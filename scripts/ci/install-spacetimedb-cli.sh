#!/usr/bin/env bash
# Install SpacetimeDB CLI for CI (GitHub Actions, local parity).
# Adds ~/.local/bin to GITHUB_PATH when running in Actions.
set -euo pipefail

if command -v spacetime >/dev/null 2>&1; then
  echo "spacetime CLI already on PATH: $(command -v spacetime)"
  spacetime version 2>/dev/null || true
  exit 0
fi

curl -fsSL https://install.spacetimedb.com | bash -s -- --yes

if [[ -n "${GITHUB_PATH:-}" ]]; then
  echo "${HOME}/.local/bin" >>"$GITHUB_PATH"
fi
export PATH="${HOME}/.local/bin:${PATH}"

command -v spacetime >/dev/null || {
  echo "error: spacetime not on PATH after install" >&2
  exit 1
}
echo "spacetime CLI ready: $(command -v spacetime)"
spacetime version 2>/dev/null || true

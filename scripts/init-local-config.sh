#!/usr/bin/env bash
# Create gitignored config files from committed examples (never overwrites).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

mkdir -p .dev

copy_if_missing() {
  local src="$1"
  local dst="$2"
  if [[ -f "$dst" ]]; then
    echo "  keep  $dst (already exists)"
    return
  fi
  if [[ ! -f "$src" ]]; then
    echo "  skip  $dst (example missing: $src)" >&2
    return
  fi
  cp "$src" "$dst"
  chmod 600 "$dst" 2>/dev/null || true
  echo "  create $dst"
}

echo "==> Initialising local config (gitignored)"
copy_if_missing ".env.example" ".env"
copy_if_missing "docs/local.env.example" ".dev/local.env"
copy_if_missing "docs/feed-secrets.example.json" ".dev/feed-secrets.json"
copy_if_missing "web/.env.example" "web/.env"

echo ""
echo "Edit the files above with your keys and preferences."
echo "See docs/CONFIG.md — never commit .env, .dev/, or web/.env."

#!/usr/bin/env bash
# Fail if secret-bearing paths are tracked by git.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail=0

while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  case "$path" in
    .env.example|web/.env.example|docs/feed-secrets.example.json|docs/local.env.example)
      continue
      ;;
    .env|.env.local|.env.*.local|web/.env|web/.env.local|web/.env.*.local)
      echo "ERROR: tracked local env file: $path" >&2
      fail=1
      ;;
  esac
  if [[ "$path" == .dev/* ]]; then
    echo "ERROR: tracked .dev/ path: $path" >&2
    fail=1
  fi
  if [[ "$path" == *feed-secrets.json && "$path" != docs/feed-secrets.example.json ]]; then
    echo "ERROR: tracked feed secrets file: $path" >&2
    fail=1
  fi
done < <(git ls-files 2>/dev/null || true)

if [[ "$fail" -ne 0 ]]; then
  echo "Remove from git: git rm --cached <path>  (see docs/CONFIG.md)" >&2
  exit 1
fi

echo "OK: no local secret files tracked in git"

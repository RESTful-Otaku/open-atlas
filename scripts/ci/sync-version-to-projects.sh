#!/usr/bin/env bash
# Sync OPENATLAS_RELEASE_VERSION into package.json, Cargo.toml, and native app metadata.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VER="${OPENATLAS_RELEASE_VERSION:?OPENATLAS_RELEASE_VERSION required}"

# package.json (bun/node)
if command -v bun >/dev/null 2>&1; then
  bun -e "
    const fs = require('fs');
    const p = '${ROOT}/web/package.json';
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    j.version = '${VER}';
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  "
else
  sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${VER}\"/" "${ROOT}/web/package.json"
fi

# Cargo workspace
sed -i "s/^version = \".*\"/version = \"${VER}\"/" "${ROOT}/Cargo.toml"

bash "${ROOT}/scripts/ci/set-native-app-version.sh"

printf 'Synced project version to %s\n' "$VER"

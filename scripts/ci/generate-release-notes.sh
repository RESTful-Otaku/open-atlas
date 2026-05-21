#!/usr/bin/env bash
# Write GitHub release notes from commits since the previous release tag.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${1:-${ROOT}/dist/release-notes.md}"
TAG="${OPENATLAS_RELEASE_TAG:?}"
VER="${OPENATLAS_RELEASE_VERSION:?}"

mkdir -p "$(dirname "$OUT")"
cd "$ROOT"

prev_tag=""
prev_tag="$(git tag -l 'v*' --sort=-v:refname | grep -Fxv "$TAG" | head -n1 || true)"

{
  echo "## OpenAtlas ${VER}"
  echo ""
  echo "Pre-release build targeting **Maincloud** (\`wss://maincloud.spacetimedb.com\`, db \`openatlas\`)."
  echo ""
  echo "### Artifacts"
  echo "- Web static bundle (\`openatlas-web-${VER}.tar.gz\`)"
  echo "- Android release APK (unsigned, Maincloud)"
  echo "- iOS simulator build; signed IPA when \`IOS_*\` secrets are configured"
  echo ""
  echo "### Mobile"
  echo "- **LLM:** Settings → Google Gemini (API key on device)"
  echo "- **Feeds:** Ingest → Maincloud STDB (optional public ingest URL at build)"
  echo ""
  echo "### Changes"
  if [[ -n "$prev_tag" ]]; then
    echo "_Since \`${prev_tag}\`:_"
    echo ""
    git log "${prev_tag}..HEAD" --pretty=format:'- %s (%h)' --no-merges 2>/dev/null || echo "- (no commits)"
  else
    echo "- Initial pre-release"
  fi
} >"$OUT"

printf 'Wrote %s\n' "$OUT"

#!/usr/bin/env bash
# Compute next semver prerelease from VERSION channel + existing git tags.
# Outputs: OPENATLAS_RELEASE_VERSION, OPENATLAS_RELEASE_TAG (v-prefix).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export OPENATLAS_VERSION_FILE="${OPENATLAS_VERSION_FILE:-${ROOT}/VERSION}"
BUMP_MODE="${OPENATLAS_BUMP_MODE:-prerelease}"

# shellcheck source=scripts/ci/version-lib.sh
source "${ROOT}/scripts/ci/version-lib.sh"

channel="$(version_channel)"
case "$BUMP_MODE" in
  prerelease)
    OPENATLAS_RELEASE_VERSION="$(version_next_prerelease "$channel")"
    ;;
  none|current)
    OPENATLAS_RELEASE_VERSION="$channel"
    ;;
  *)
    echo "release-bump: unknown OPENATLAS_BUMP_MODE=${BUMP_MODE}" >&2
    exit 1
    ;;
esac

OPENATLAS_RELEASE_TAG="v${OPENATLAS_RELEASE_VERSION}"
export OPENATLAS_RELEASE_VERSION OPENATLAS_RELEASE_TAG

printf 'version=%s\n' "$OPENATLAS_RELEASE_VERSION"
printf 'tag=%s\n' "$OPENATLAS_RELEASE_TAG"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "version=${OPENATLAS_RELEASE_VERSION}"
    echo "tag=${OPENATLAS_RELEASE_TAG}"
  } >>"$GITHUB_OUTPUT"
fi

printf 'Next release: %s (%s)\n' "$OPENATLAS_RELEASE_VERSION" "$OPENATLAS_RELEASE_TAG"

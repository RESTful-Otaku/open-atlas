#!/usr/bin/env bash
# Semver helpers for OpenAtlas releases (channel in VERSION, tags v{full}).
set -euo pipefail

version_channel() {
  local raw
  raw="$(tr -d '[:space:]' <"${OPENATLAS_VERSION_FILE:?}")"
  raw="${raw#v}"
  [[ -n "$raw" ]] || {
    echo "version-lib: empty VERSION file" >&2
    return 1
  }
  printf '%s' "$raw"
}

# Next prerelease: 1.0.0-alpha -> 1.0.0-alpha.1; 1.0.0-alpha.2 -> 1.0.0-alpha.3
version_next_prerelease() {
  local channel="$1"
  local latest_tag next_n prefix
  prefix="v${channel}"
  latest_tag="$(git tag -l "${prefix}.*" "${prefix}" 2>/dev/null | sort -V | tail -n1 || true)"
  if [[ -z "$latest_tag" ]]; then
    printf '%s.1' "$channel"
    return 0
  fi
  latest_tag="${latest_tag#v}"
  if [[ "$latest_tag" == "$channel" ]]; then
    printf '%s.1' "$channel"
    return 0
  fi
  if [[ "$latest_tag" =~ ^${channel}\.([0-9]+)$ ]]; then
    next_n=$((BASH_REMATCH[1] + 1))
    printf '%s.%s' "$channel" "$next_n"
    return 0
  fi
  echo "version-lib: cannot parse latest tag ${latest_tag} for channel ${channel}" >&2
  return 1
}

# Numeric build code for Android versionCode / iOS CURRENT_PROJECT_VERSION.
version_build_code() {
  local ver="$1"
  local major=0 minor=0 patch=0 pre=0
  if [[ "$ver" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+) ]]; then
    major="${BASH_REMATCH[1]}"
    minor="${BASH_REMATCH[2]}"
    patch="${BASH_REMATCH[3]}"
  fi
  if [[ "$ver" =~ alpha\.([0-9]+)$ ]]; then
    pre="${BASH_REMATCH[1]}"
  elif [[ "$ver" =~ -alpha$ ]]; then
    pre=0
  fi
  printf '%s' $((major * 1000000 + minor * 10000 + patch * 100 + pre))
}

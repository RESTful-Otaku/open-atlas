#!/usr/bin/env bash
# Import iOS distribution/development cert + provisioning profile for CI archive/export.
# Required secrets (GitHub environment or repo): IOS_BUILD_CERTIFICATE_BASE64,
# IOS_BUILD_PROVISION_PROFILE_BASE64, IOS_KEYCHAIN_PASSWORD, IOS_TEAM_ID
set -euo pipefail

: "${IOS_BUILD_CERTIFICATE_BASE64:?IOS_BUILD_CERTIFICATE_BASE64 required}"
: "${IOS_BUILD_PROVISION_PROFILE_BASE64:?IOS_BUILD_PROVISION_PROFILE_BASE64 required}"
: "${IOS_KEYCHAIN_PASSWORD:?IOS_KEYCHAIN_PASSWORD required}"
: "${IOS_TEAM_ID:?IOS_TEAM_ID required}"

KEYCHAIN_PATH="${RUNNER_TEMP:-/tmp}/app-signing.keychain-db"
CERT_PATH="${RUNNER_TEMP:-/tmp}/build_certificate.p12"
PROFILE_PATH="${RUNNER_TEMP:-/tmp}/build_profile.mobileprovision"
PROFILE_UUID=""

security create-keychain -p "$IOS_KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$IOS_KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

echo "$IOS_BUILD_CERTIFICATE_BASE64" | base64 --decode >"$CERT_PATH"
security import "$CERT_PATH" -P "" -A -t cert -f pkcs12 -k "$KEYCHAIN_PATH"
security list-keychain -d user -s "$KEYCHAIN_PATH"

echo "$IOS_BUILD_PROVISION_PROFILE_BASE64" | base64 --decode >"$PROFILE_PATH"
mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
PROFILE_PLIST="${RUNNER_TEMP:-/tmp}/profile.plist"
security cms -D -i "$PROFILE_PATH" >"$PROFILE_PLIST"
PROFILE_UUID="$(/usr/libexec/PlistBuddy -c 'Print UUID' "$PROFILE_PLIST")"
cp "$PROFILE_PATH" ~/Library/MobileDevice/Provisioning\ Profiles/"${PROFILE_UUID}.mobileprovision"

export IOS_PROVISIONING_PROFILE_UUID="$PROFILE_UUID"
if [[ -n "${GITHUB_ENV:-}" ]]; then
  echo "IOS_PROVISIONING_PROFILE_UUID=${PROFILE_UUID}" >>"$GITHUB_ENV"
fi
echo "iOS codesign: keychain + profile ${PROFILE_UUID} installed"

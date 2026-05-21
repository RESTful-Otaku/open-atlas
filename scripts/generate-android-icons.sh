#!/usr/bin/env bash
# Generate Android launcher icons from media/logo.png (OpenAtlas brand).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bash "${ROOT}/scripts/sync-brand-assets.sh"
LOGO="${ROOT}/media/logo.png"
RES="${ROOT}/web/android/app/src/main/res"
BG="#09090b"

if [[ ! -f "$LOGO" ]]; then
  echo "missing logo: $LOGO" >&2
  exit 1
fi
if ! command -v magick >/dev/null 2>&1 && ! command -v convert >/dev/null 2>&1; then
  echo "ImageMagick required (magick or convert)" >&2
  exit 1
fi

MG() {
  if command -v magick >/dev/null 2>&1; then magick "$@"; else convert "$@"; fi
}

icon_square() {
  local out="$1" px="$2" logo_pct="${3:-72}"
  local inner=$(( px * logo_pct / 100 ))
  MG "$LOGO" -resize "${inner}x${inner}" -background "$BG" -gravity center -extent "${px}x${px}" "PNG32:$out"
}

icon_foreground() {
  local out="$1" px="$2"
  local inner=$(( px * 62 / 100 ))
  MG "$LOGO" -resize "${inner}x${inner}" -background none -gravity center -extent "${px}x${px}" "PNG32:$out"
}

echo "Generating Android icons from ${LOGO}"

# Legacy / fallback launcher icons
declare -A LAUNCHER=(
  [mipmap-mdpi]=48
  [mipmap-hdpi]=72
  [mipmap-xhdpi]=96
  [mipmap-xxhdpi]=144
  [mipmap-xxxhdpi]=192
)
for dir in "${!LAUNCHER[@]}"; do
  px="${LAUNCHER[$dir]}"
  mkdir -p "${RES}/${dir}"
  icon_square "${RES}/${dir}/ic_launcher.png" "$px"
  cp "${RES}/${dir}/ic_launcher.png" "${RES}/${dir}/ic_launcher_round.png"
  echo "  ${dir}/ic_launcher.png (${px}px)"
done

# Adaptive icon foreground layers
declare -A FOREGROUND=(
  [mipmap-mdpi]=108
  [mipmap-hdpi]=162
  [mipmap-xhdpi]=216
  [mipmap-xxhdpi]=324
  [mipmap-xxxhdpi]=432
)
for dir in "${!FOREGROUND[@]}"; do
  px="${FOREGROUND[$dir]}"
  mkdir -p "${RES}/${dir}"
  icon_foreground "${RES}/${dir}/ic_launcher_foreground.png" "$px"
  echo "  ${dir}/ic_launcher_foreground.png (${px}px)"
done

# Dark background for adaptive icon
cat >"${RES}/values/ic_launcher_background.xml" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BG}</color>
</resources>
EOF

echo "Done — rebuild APK: ./dev.sh run-android"

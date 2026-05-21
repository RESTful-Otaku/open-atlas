# OpenAtlas mobile (Svelte + Capacitor)

Installable **Android** and **iOS** apps reuse the same `web/` bundle as the desktop dashboard. Desktop web at widths **above 1024px** is unchanged. Phone (≤768px), tablet (769–1024px), and native shells get a bottom tab bar, safe-area padding, and touch-sized controls.

**UX plan (layout, gestures, settings):** [MOBILE_UX_PLAN.md](./MOBILE_UX_PLAN.md)

## App icon

Brand source files live in **`media/logo.png`** and **`media/logo.ico`**. They are synced to `web/public/` for the site and APK.

Regenerate Android mipmaps after logo changes:

```bash
./scripts/sync-brand-assets.sh
./scripts/generate-android-icons.sh
# or automatically during ./dev.sh mobile:setup / run-android
```

Requires ImageMagick (`magick` or `convert`). Adaptive icon background matches the app shell (`#09090b`).

## Prerequisites

| Platform | Requirements |
|----------|----------------|
| **Web build** | [Bun](https://bun.sh), `cd web && bun install` |
| **Android** | JDK 17+, Android SDK (Android Studio or `sdkmanager`), `adb` |
| **iOS** | **macOS** with Xcode 15+ (archive/signing cannot run on Linux CI alone) |

## One-click dev harness

From the repo root:

```bash
./dev.sh run-android              # Maincloud QA on emulator (like production phone + host ingest)
./dev.sh run-android:local        # Local ./dev.sh stack via 10.0.2.2
./dev.sh mobile:doctor            # Check JDK, SDK, adb, Pixel 9 Pro AVD (no build)
./dev.sh mobile:setup      # bootstrap toolchain + cap add android + first sync
./dev.sh mobile:build      # vite build + cap sync
./dev.sh mobile:android    # bootstrap + debug APK via Gradle
./dev.sh mobile:android:release   # assembleRelease APK path
./dev.sh mobile:dev        # Vite live reload on device (CAPACITOR_SERVER_URL)
./dev.sh mobile:ios        # cap sync + open Xcode (Mac only)
```

### Run on Pixel 9 Pro emulator (recommended)

```bash
./dev.sh run-android
```

This command is **idempotent** and handles missing dependencies when possible:

1. **Toolchain bootstrap** — JDK 17 (`JAVA_HOME`, not Java 26), `ANDROID_HOME`, SDK packages, creates **`OpenAtlas_Pixel_9_Pro`** AVD (`pixel_9_pro` device profile) if missing
2. **`bun test src/lib`** (skip with `OPENATLAS_MOBILE_SKIP_TESTS=1`)
3. **Start emulator** (so env targets the emulator gateway when auto-detecting)
4. **`web/.env.capacitor.local`** from `scripts/mobile-env.sh` (Maincloud + `10.0.2.2` ingest by default)
5. **`bun run build:cap`** (Vite `--mode capacitor`) + **`cap sync android`**
6. **`./gradlew assembleDebug`** → **`adb install -r`** → launch **`com.openatlas.app/.MainActivity`**

Persisted env after bootstrap: **`.dev/android.env`** (gitignored) — `JAVA_HOME`, `ANDROID_HOME`, `PATH`, `OPENATLAS_AVD_NAME`.

### First-time / broken toolchain

```bash
./dev.sh mobile:doctor          # diagnose only
./scripts/mobile-android-toolchain.sh bootstrap   # JDK + SDK + AVD only
```

On **Arch**, bootstrap may install (with passwordless `sudo` or prompt):

- `jdk21-openjdk` (Capacitor 7 compiles with Java 21; Java 26 breaks Gradle)
- `android-tools` / `android-sdk` when SDK paths are missing

Set **`OPENATLAS_ANDROID_AUTO_INSTALL=0`** to disable automatic `pacman`/`apt` installs.

Override AVD:

```bash
OPENATLAS_AVD_NAME=MyPixel ./dev.sh run-android
OPENATLAS_ANDROID_DEVICE_ID=pixel_9_pro OPENATLAS_ANDROID_API_LEVEL=36  # defaults
```

### Build targets (env baked into APK)

`./dev.sh run-android` writes **`web/.env.capacitor.local`** (gitignored) and builds with **`bun run build:cap`** so env is actually baked into the APK. It does **not** overwrite `web/.env.local` (desktop Vite dev keeps using the proxy).

| Target | When | `VITE_*` endpoints |
|--------|------|-------------------|
| **maincloud-emulator** (default for `run-android`) | Menu “Maincloud QA” or auto when `adb` sees `emulator-*` | `wss://maincloud.spacetimedb.com` + `10.0.2.2` ingest `:8080` / LLM `:3847` + `VITE_NATIVE_DEFAULT_LLM=gemini` |
| **emulator** | `run-android:local` or explicit override | `10.0.2.2` → host STDB `:3000`, ingest `:8080`, LLM `:3847` |
| **device** | USB/Wi‑Fi physical device | Auto LAN IP → same ports on your machine |
| **maincloud** + `MAINCLOUD_PHYSICAL=1` | Release APK / physical phone | Maincloud STDB only (Gemini in Settings) |

```bash
# Recommended: Maincloud QA on emulator (matches phone STDB; host ingest for feeds/ops console)
OPENATLAS_STDB_URI=https://maincloud.spacetimedb.com OPENATLAS_STDB_DB=openatlas \
  OPENATLAS_INGEST_LAN_BIND=1 ./dev.sh ingest:start
./dev.sh run-android
# or: make mobile-run-maincloud

# Local ./dev.sh stack on emulator (STDB + ingest on laptop)
./dev.sh up
./dev.sh run-android:local

# Physical phone: Maincloud STDB + ingest/LLM on laptop (same Wi‑Fi)
./dev.sh spacetime:publish:cloud
OPENATLAS_STDB_URI=https://maincloud.spacetimedb.com OPENATLAS_STDB_DB=openatlas ./dev.sh ingest:start
OPENATLAS_MOBILE_TARGET=maincloud-lan ./scripts/mobile-build-apk.sh

# Production-like phone APK (STDB only)
OPENATLAS_MOBILE_TARGET=maincloud OPENATLAS_MOBILE_MAINCLOUD_PHYSICAL=1 ./scripts/mobile-build-apk.sh
```

**Ingest on emulator:** the WebView calls `http://10.0.2.2:8080`, which maps to your laptop. Ingest must listen on **`0.0.0.0:8080`** — `run-android` warns if `/health` is down. Use `OPENATLAS_INGEST_LAN_BIND=1` or `./dev.sh run:cloud:live` before the mobile build.

Makefile aliases: `make mobile-setup`, `make mobile-build`, `make mobile-android`, etc.

## Network configuration (critical)

Capacitor WebViews **cannot** use `127.0.0.1` on the phone to reach services on your laptop. Set build-time env vars before `bun run build`:

| Variable | Purpose |
|----------|---------|
| `VITE_STDB_URI` | SpacetimeDB WebSocket (`ws://` or `wss://`) |
| `VITE_STDB_DB` | Module/database name (default `openatlas`) |
| `VITE_INGEST_BASE` | Ingest HTTP root (no trailing `/`) |
| `VITE_LLM_BASE` | LLM bridge HTTP root |

Copy the template:

```bash
cp web/.env.mobile.example web/.env.local
# edit for emulator (10.0.2.2) or LAN IP / cloud URLs
cd web && bun run build && npx cap sync android
```

### Host aliases

| Scenario | STDB | Ingest / LLM |
|----------|------|----------------|
| **Android emulator → dev machine** | `ws://10.0.2.2:3000` | `http://10.0.2.2:8080`, `http://10.0.2.2:3847` |
| **Physical device on Wi‑Fi** | `ws://<LAN-IP>:3000` | `http://<LAN-IP>:8080`, … |
| **SpacetimeDB Cloud** | `wss://maincloud.spacetimedb.com` | Public staging URLs for ingest/LLM |
| **Phone anywhere (internet)** | `wss://maincloud.spacetimedb.com` | Optional `OPENATLAS_PUBLIC_INGEST_URL` at build (see below) |

**Feeds on a physical phone:** the app reads live rows from **Maincloud STDB**. Third-party APIs are polled by **ingest on a server**, not from the WebView. A `maincloud` APK without `VITE_INGEST_BASE` does not call ingest HTTP (avoids “failed to fetch” against the Capacitor origin). The top bar **Feeds** pill then reflects STDB connection, not a LAN ingest probe.

**Optional public ingest health** (operator UI only):

```bash
OPENATLAS_PUBLIC_INGEST_URL=https://ingest.example.com \
  OPENATLAS_MOBILE_TARGET=maincloud \
  ./scripts/mobile-build-apk.sh
```

**LLM on mobile:** Settings → **LLM providers** — configure **Google Gemini** (API key in browser storage) or an OpenAI-compatible endpoint. No local Ollama required. iOS/Android cannot invoke Siri or ChatGPT apps from the WebView; use cloud APIs instead.

`capacitor.config.ts` enables **cleartext HTTP** for local dev. Production APKs should use HTTPS/WSS endpoints.

### Live reload (optional)

With Vite on your machine bound to `0.0.0.0:5173`:

```bash
export CAPACITOR_SERVER_URL=http://10.0.2.2:5173   # emulator
./dev.sh mobile:dev
```

## Install APK on a Pixel (or any device)

After `./dev.sh mobile:android` or CI artifact download:

```bash
adb install -r web/android/app/build/outputs/apk/debug/app-debug.apk
```

Release APK (unsigned, for sideload testing):

```text
web/android/app/build/outputs/apk/release/app-release-unsigned.apk
```

Play Store / production requires a signed release keystore (not checked into the repo).

## Emulator helper

```bash
./scripts/mobile-android-emulator.sh
```

Starts the first AVD, waits for boot, installs the debug APK if present.

## iOS notes

- `npx cap add ios` on Linux may create a partial `web/ios/` tree; **archives and App Store uploads require a Mac**.
- **Maincloud build script** (same env baking as Android):

```bash
OPENATLAS_MOBILE_TARGET=maincloud ./scripts/mobile-build-ios.sh
# Device IPA (macOS + Apple signing secrets):
OPENATLAS_MOBILE_VARIANT=release ./scripts/mobile-build-ios.sh
# → dist/mobile/openatlas-maincloud-ios.ipa
```

- `./dev.sh mobile:ios` / `make mobile-ios-maincloud` — runs the script above; on macOS opens Xcode afterward.
- **Linux:** syncs `web/dist` → `web/ios/` (no `xcodebuild`); finish on a Mac.

### Maincloud, ingest, and LLM on iPhone

| Concern | Behavior |
|---------|----------|
| **SpacetimeDB** | Baked `wss://maincloud.spacetimedb.com` · db `openatlas` |
| **Feeds / ingest** | Live rows come from **Maincloud** (ingest runs on a server). Optional `OPENATLAS_PUBLIC_INGEST_URL` at build for health UI. |
| **LLM / “ChatGPT”** | **Settings → Google Gemini** (API key) or OpenAI-compatible URL — keys stay on device. Default provider: `VITE_NATIVE_DEFAULT_LLM=gemini`. |
| **Siri / ChatGPT app** | iOS does not let the WebView invoke Siri or the ChatGPT app; use **Gemini** or an HTTP API in Settings (same as Android). |

### CI ([`mobile-ios.yml`](../.github/workflows/mobile-ios.yml))

| Artifact | When |
|----------|------|
| `openatlas-ios-simulator` | Every successful run (`.app` zip, compile gate) |
| `openatlas-ios-maincloud` | Signed `.ipa` when `IOS_*` GitHub secrets are set |

Workflow dispatch: **simulator** or **release-ipa**. Tags `v*` attempt release IPA if secrets exist.

Signing secrets: see [`docs/GITHUB_SECRETS.md`](./GITHUB_SECRETS.md#ios-ci-signing-optional).

## Production / CI builds

Shared script (same env as CI):

```bash
# Maincloud APK for a physical phone (STDB only — no laptop ingest URLs)
OPENATLAS_MOBILE_TARGET=maincloud ./scripts/mobile-build-apk.sh
# → dist/mobile/openatlas-maincloud-debug.apk

# Unsigned release (sideload / sign locally)
OPENATLAS_MOBILE_VARIANT=release ./scripts/mobile-build-apk.sh
```

`OPENATLAS_MOBILE_MAINCLOUD_PHYSICAL=1` is set automatically for `maincloud` builds so CI and phone installs do not bake in `10.0.2.2` ingest URLs.

## CI artifacts

| Workflow | Trigger | Output |
|----------|---------|--------|
| [`mobile-android.yml`](../.github/workflows/mobile-android.yml) | `workflow_dispatch`, tags `v*` | **`openatlas-android-debug`** — Maincloud `VITE_STDB_*`; optional **release-unsigned** on tags |
| [`mobile-ios.yml`](../.github/workflows/mobile-ios.yml) | `workflow_dispatch`, tags `v*` | Simulator zip + optional **Maincloud IPA** (`IOS_*` secrets) |
| [`deploy-production.yml`](../.github/workflows/deploy-production.yml) | Manual promote | Web dist + ingest binary + **APK** in production tarball |

Download Android APK from Actions → **Artifacts**, or use `dist/mobile/` after `./scripts/mobile-build-apk.sh`.

```bash
adb install -r dist/mobile/openatlas-maincloud-debug.apk
```

iOS: run the iOS workflow or `bunx cap open ios` on a Mac after a Maincloud web build.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| STDB “connection failed” on device | Rebuild with correct `VITE_STDB_URI`; cloud URL for demos without laptop |
| Ingest / LLM 404 or network error | Set `VITE_INGEST_BASE` / `VITE_LLM_BASE`; ensure ingest listens on `0.0.0.0` or use port forwarding |
| Blank WebView after install | Run `bun run build` then `npx cap sync`; check `web/dist` exists |
| CORS / mixed content | Use `http://` only in dev with cleartext; prefer HTTPS in production |
| Gradle / SDK missing locally | `./dev.sh mobile:doctor` or `./dev.sh run-android` (auto-bootstrap) |
| `invalid source release: 21` | Use JDK 21 (`zulu-21` / `jdk21-openjdk`), not Java 17-only or Java 26 |
| `emulator -list-avds` empty | Set `ANDROID_AVD_HOME` (~/.config/.android/avd on Linux) — bootstrap writes `.dev/android.env` |

## Code map

- `web/capacitor.config.ts` — app id `com.openatlas.app`, `webDir: dist`
- `web/src/lib/native-config.ts` — service URL helpers
- `web/src/lib/mobile-layout.svelte.ts` — `data-native` / `data-mobile-layout`
- `web/src/lib/shell/MobileBottomNav.svelte` — bottom tabs
- `web/android/` — Capacitor Android project (committed)

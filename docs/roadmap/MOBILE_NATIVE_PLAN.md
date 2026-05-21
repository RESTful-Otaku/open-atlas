# Mobile & native execution plan

Capacitor Android/iOS shells reuse the `web/` bundle. **Desktop web** (viewport `>1024px`, no layout datasets) must remain fully functional and visually unchanged.

| Range | HTML datasets |
|-------|----------------|
| Phone ≤768px | `data-mobile-layout`, `data-compact-layout` |
| Tablet 769–1024px | `data-tablet-layout`, `data-compact-layout` |
| Native | `data-native`, compact (+ mobile on narrow phones) |

Mobile-only behavior uses these datasets — not unscoped global CSS.

**Related docs:** [MOBILE.md](../MOBILE.md) (build, env, CI), [MOBILE_UX_PLAN.md](../MOBILE_UX_PLAN.md) (UX slice notes).

## Status legend

| Mark | Meaning |
|------|---------|
| `[ ]` | Planned |
| `[~]` | In progress |
| `[x]` | Done in repo |

## Phases

| Phase | Scope | Status |
|-------|--------|--------|
| **M0** | Guardrails: desktop regression checklist, test commands | `[x]` |
| **M1** | Safe areas, full-bleed pages, bottom nav polish | `[x]` |
| **M2** | Mobile top bar: declutter; search row below, expand on focus | `[x]` |
| **M3** | Charts/matrices/domains: 1 chart per row mobile only | `[x]` |
| **M4** | Touch: 44px targets, map pinch/zoom, layers bottom sheet | `[x]` |
| **M5** | Settings native mobile layout (grouped list, full width) | `[x]` |
| **M6** | `dev.sh` one-click `run-android` / `run-ios` (full pipeline) | `[x]` |
| **M7** | CI APK/IPA artifacts | `[~]` |

### M0 — Guardrails

Desktop regression (run after every mobile PR):

- Viewport **1280×800**: left rail visible; top bar three-column (brand | search | status).
- `data-compact-layout`, `data-mobile-layout`, `data-tablet-layout` **must be unset** at 1280px width.
- Command palette **⌘K** from desktop search button.
- Hub / domain / matrix multi-column charts unchanged on desktop.
- Playwright: `web/e2e/desktop-layout.spec.ts` at 1280×800.

Commands:

```bash
cargo test --workspace
cd web && bun run check && bun test src/lib && bun run build
cd web && bun run test:e2e -- e2e/desktop-layout.spec.ts
cd web && bun run test:e2e -- e2e/mobile-layout.spec.ts
cd web && bun run test:e2e -- e2e/tablet-layout.spec.ts
# Optional: cd web && bun run test:e2e -- --grep map-demo
```

### M1 — Safe areas & page fill

- [x] `app.css`: `env(safe-area-inset-top)` on top stack; bottom nav uses `--mobile-nav-height`.
- [x] `.route-view`, `#shell-main.shell-main-fill`: full height on `data-mobile-layout` only.
- [x] Desktop padding unchanged (no mobile selectors on `#app` at wide widths).

### M2 — Mobile top bar / search

- [x] `ShellTopBar.svelte`: compact row (logo/title, connection pill, menu); search on second row (`.shell-top-search-row`).
- [x] Collapsed “Search…” → full-width input + palette results; collapse on blur / Escape.
- [x] Desktop top bar: separate markup path — no shared mobile-only classes without `data-mobile-layout`.

### M3 — Charts one per row (mobile only)

- [x] `app.css` + component hooks: `hub-grid-*`, `desk-charts-grid`, `matrix-grid` → single column under `html[data-mobile-layout]`.
- [x] Desktop grid templates unchanged.

### M4 — Touch

- [x] 44px min tap targets (bottom nav, map float controls, layers pills, settings buttons) — `app.css` + component hooks.
- [x] Map layers bottom sheet above bottom nav (85dvh max, drag handle, backdrop tap to close).
- [x] MapLibre `cooperativeGestures: false` on mobile; `touch-action: none` on map canvas.
- [x] ThreeGlobe touch orbit/zoom (`enablePointerInteraction`, `touch-action: none` on wrap).
- [x] Mobile domains picker: full-screen sheet + backdrop ( `MobileBottomNav.svelte` ).
- [x] Hub padding reduction; KPI strip single column; domain map aside hidden; matrix AI accordion on mobile.
- [x] Swipe-to-dismiss layers sheet (drag handle down ≥80px on mobile; backdrop + Escape unchanged).
- [ ] Double-tap zoom audit on MapLibre native WebView (defaults on; verify on device).

### M5 — Settings native layout

- [x] `SettingsView.svelte`: full-bleed grouped sections (Operations, STDB, LLM, Appearance) on mobile only.

### M6 — Dev one-click Android / iOS stub

- [x] `./dev.sh mobile:run` / `./dev.sh run-android`: JDK 17, SDK, adb checks → tests → build → cap sync → emulator → Gradle → install → launch.
- [x] `./dev.sh run-ios` / `./dev.sh mobile:ios`: macOS → build → cap sync ios → open Xcode; Linux syncs `ios/` when present.
- [ ] iOS one-click run on simulator (signing / `cap run ios` automation — still manual Run in Xcode).

### M7 — CI artifacts

- [x] [`.github/workflows/mobile-android.yml`](../../.github/workflows/mobile-android.yml) — debug APK on dispatch/tags.
- [ ] iOS workflow when signing story exists.

## Implementation log

| Date | Slice |
|------|--------|
| 2026-05 | M0 plan doc; M1–M3, M5; M6 Android `mobile:run` |
| 2026-05 | M4 touch polish; desktop Playwright guard; `run-ios` stub |
| 2026-05 | M4 swipe-dismiss layers; mobile Playwright e2e; splash hide on ready; CI summaries |
| 2026-05 | Tablet 769–1024 (`data-tablet-layout`); compact shell ≤1024; tablet e2e |

### Tablet (769–1024px)

- [x] `data-tablet-layout` + `data-compact-layout` via `mobile-layout.ts`
- [x] Bottom nav + mobile top bar (same as phone shell)
- [x] Two-column hub / domain / matrix / viz grids (phone stays 1-col)
- [x] `e2e/tablet-layout.spec.ts` at 820×1180

## Dependencies

- Phase C ship checklist: [PHASE_C_SHIP.md](./PHASE_C_SHIP.md) (mobile CI row).
- Do not block desktop Phase B UX on mobile phases.

# Mobile UX plan

Capacitor shell and compact viewports reuse the Svelte `web/` bundle.

| Range | Dataset | Shell |
|-------|---------|--------|
| **Desktop** | `>1024px` (none) | Left rail + three-column top bar |
| **Tablet** | `769–1024px` → `data-tablet-layout` + `data-compact-layout` | Bottom nav, mobile top bar, 2-col charts |
| **Phone** | `≤768px` → `data-mobile-layout` + `data-compact-layout` | Same shell, 1-col charts |
| **Native** | `data-native` + compact/mobile | Same as phone width |

**Desktop web** at widths **>1024px** must stay fully functional and visually unchanged. All mobile-only styling uses layout datasets or `@media` scoped to compact/mobile/tablet only.

See also: [MOBILE.md](./MOBILE.md) (build, env, CI), [roadmap/MOBILE_NATIVE_PLAN.md](./roadmap/MOBILE_NATIVE_PLAN.md) (execution phases).

## Phases

| Phase | Theme | Status |
|-------|--------|--------|
| **M1** | Safe areas, full-bleed pages, bottom nav, settings native layout | Done |
| **M2** | Top bar declutter — search in dedicated row (collapsed/expanded) | Done |
| **M3** | Touch — 44px targets, map layers bottom sheet, pinch on MapLibre | Done |
| **M4** | Charts: 1/row phone, 2/row tablet; hub, domain, matrix, viz | Done |
| **M5** | `dev.sh run-android` one-click pipeline | Done |
| **M6** | CI polish, docs, Playwright guards | Done |

## Verification checklist

### Web smoke (desktop — must not regress)

- [x] Viewport **1280×800**: left rail visible; top bar **three-column** grid
- [x] No `data-compact-layout` / `data-mobile-layout` at 1280px
- [x] `cd web && bun run check` — 0 errors
- [x] `cd web && bun test src/lib` — pass
- [x] `cd web && bun run build` — pass
- [x] `bun run test:e2e -- e2e/desktop-layout.spec.ts`

### Phone (390×844)

- [x] `data-mobile-layout` + `data-compact-layout`
- [x] Bottom nav; left rail hidden; search second row
- [x] Charts one per row; map layers bottom sheet
- [x] `bun run test:e2e -- e2e/mobile-layout.spec.ts`

### Tablet (820×1180)

- [x] `data-tablet-layout` + `data-compact-layout`; not `data-mobile-layout`
- [x] Bottom nav; 2-column chart grids
- [x] `bun run test:e2e -- e2e/tablet-layout.spec.ts`

### Android one-click

- [ ] `./dev.sh run-android` on host with JDK 17 + SDK (environment-dependent)

---

## Implementation log

| Date | Slice |
|------|--------|
| 2026-05 | M1–M5 foundation; phone layout |
| 2026-05 | Tablet breakpoint (769–1024); compact shell; docs + e2e |

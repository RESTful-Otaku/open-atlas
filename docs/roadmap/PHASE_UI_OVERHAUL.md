# Phase UI — Instrument room visual overhaul

**Vision:** Dark void operator console with subtle cyan/violet aurora, refined glass panels, crisp typography (Inter / JetBrains Mono), purposeful motion. Density stays operator-readable — not cramped, not sparse.

**Design pillars**

| Pillar | Intent |
|--------|--------|
| Surfaces | Layered void → glass cards with soft glow borders |
| Accent | Cyan primary, violet secondary — aurora in page background only |
| Motion | 120–220ms ease; respect `prefers-reduced-motion` |
| Map | Command bar + float controls share glass language |

---

## Slice 1 — Shell, map, hub reference (this pass)

- [x] Design tokens in `web/src/app.css` (surfaces, glass, glow, focus, selection, scrollbar)
- [x] Route content fade via `ActiveRoute.svelte` (`svelte/transition`, reduced-motion safe)
- [x] Left rail active state + domain group chrome
- [x] Map command bar: titles + integrated `OpsStrip`
- [x] Map float controls: glass bar, pill mode segment (Heat / Points / Both)
- [x] `MapLayersPanel` glass card, toggle pill active state
- [x] Map empty state card + accurate 24h / 7d fallback copy
- [x] `EventMapHoverCard` elevation + primary CTA
- [x] `HubOverviewCharts` panel chrome as desk reference

## Map / globe correctness (prerequisite)

- [x] Globe solar uniforms on every `simUtcMs` (`$effect` + render loop, not fingerprint-gated)
- [x] 2D night layer softer fill (opacity, color, antialias)
- [x] Empty state uses `mapDisplayEvents` / `locatedCount` + `mapUses7dFallback`
- [x] Globe causal / domains from `mapDisplayEvents`; immediate refresh on `showCausal` / mode / domains

---

## Slice 2 — Matrix, settings, viz gallery (recommended next)

- [ ] Matrix view: chart grid cards match hub glass chrome
- [ ] Settings: section panels, form controls, connection pills
- [ ] Viz showcase / legacy strip: card headers + fullscreen shell
- [ ] `ShellTopBar` + demo banner harmonized with command bar
- [ ] Shared `.oa-glass-panel` utility (optional extract from duplicated patterns)
- [ ] Chart mount transition in `FullscreenChartShell` / `EChartsPanel`

## Slice 3 — Domain desks + data surfaces

- [ ] `DomainChartsBlock` headers + preset chips
- [ ] Event detail / stream list typography hierarchy
- [ ] Matrix bound panels + causal graph chrome
- [ ] Toast / command palette glass pass

## Slice 4 — Polish & a11y

- [ ] Light/dim theme token parity audit
- [ ] Keyboard focus order on map float UI
- [ ] E2E screenshots: map command bar, layers panel, hover card
- [ ] Performance: verify glass `backdrop-filter` on low-end GPUs

---

## Out of scope

- Rewriting all 13 domain pages in one pass
- New heavy UI dependencies
- Breaking map/globe layer behavior or STDB connection flows

## Verification

```bash
cd web && bun run check
cd web && bun test src/lib/map/ src/lib/components/ops-strip.test.ts
```

Manual: demo mode → `/map` and `/` globe — scrub solar time (shadow moves), toggle causal, empty state only when `locatedCount === 0`.

# OpenAtlas roadmap index

Living checklists split by execution phase. Use this folder for day-to-day iteration; the executive view stays in [`../PRODUCT_ROADMAP.md`](../PRODUCT_ROADMAP.md).

## Status legend

| Mark | Meaning |
|------|---------|
| `[ ]` | Planned — not started or not verified |
| `[~]` | In progress — partial implementation or scaffold |
| `[x]` | Done — shipped and verified in repo/CI |

## Phase documents

| Phase | File | Priority | Theme |
|-------|------|----------|-------|
| **A** | [PHASE_A_TRUST.md](./PHASE_A_TRUST.md) | P0 | Trust, determinism, doc accuracy, ingest safety |
| **B** | [PHASE_B_UX.md](./PHASE_B_UX.md) | P1 | Map/globe instrument room, desks, operator UX |
| **UI** | [PHASE_UI_OVERHAUL.md](./PHASE_UI_OVERHAUL.md) | P1 | Visual system — glass shell, map chrome, hub reference |
| **C** | [PHASE_C_SHIP.md](./PHASE_C_SHIP.md) | P1 | Deploy, observability, CI/CD, bundle budget |
| **D** | [PHASE_D_DEPTH.md](./PHASE_D_DEPTH.md) | P2/P3 | Causal depth, server replay, scale, new feeds |

## How to use

1. Pick the active phase doc and work top-to-bottom within P0/P1 sections.
2. Update checklist marks in the same PR as the code change.
3. Note **dependencies** inline — do not start blocked items early.
4. Link new code from the phase doc (file paths, not line numbers).
5. Reconcile closed items with [`../REVIEW_REPORT.md`](../REVIEW_REPORT.md) when findings are fully addressed.

## Authoritative references

- Architecture: [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)
- Data plane: [`../DATA_PLANE.md`](../DATA_PLANE.md)
- Product contract: [`../../OPENATLAS_SPEC.md`](../../OPENATLAS_SPEC.md)
- STDB schema caps: [`../../crates/openatlas-stdb-module/src/lib.rs`](../../crates/openatlas-stdb-module/src/lib.rs)
- Testing: [`../TESTING.md`](../TESTING.md)

## Verification (quick)

```bash
cargo test --workspace
cd web && bun run check && bun test src/lib
cd web && bun run build   # record chunk sizes for Phase C bundle budget
cargo test -p openatlas-stdb-module --test replay_harness
make replay-test   # alias for replay harness test
```

## Recent slice (2026-05)

- **UI overhaul (slice 1):** Tokens, map command bar, layers/hover chrome, route fade — [PHASE_UI_OVERHAUL.md](./PHASE_UI_OVERHAUL.md).
- **Phase C:** Playwright map demo (`map-demo.spec.ts`), ingest `/metrics`, `post-deploy-smoke.sh`, vendor chunks in Vite — see [PHASE_C_SHIP.md](./PHASE_C_SHIP.md).
- **Phase D (light):** Matrix → domain desk link; causal neighbors on event detail + map hover — see [PHASE_D_DEPTH.md](./PHASE_D_DEPTH.md).
- **Phase A:** STDB auto-reconnect + remediation copy; `event_recent` schema documented, implementation deferred — see [PHASE_A_TRUST.md](./PHASE_A_TRUST.md).

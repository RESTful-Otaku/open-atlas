# OpenAtlas — Product & Engineering Roadmap (executive index)

> **Purpose:** Executive planning view. Detailed checklists live in [`docs/roadmap/`](roadmap/README.md).
>
> **Last updated:** 2026-05-20
>
> **Status legend:** `[ ]` planned · `[~]` in progress · `[x]` done

**Related:** [ARCHITECTURE.md](../ARCHITECTURE.md) · [OPENATLAS_SPEC.md](../OPENATLAS_SPEC.md) · [DATA_PLANE.md](DATA_PLANE.md) · [REVIEW_REPORT.md](REVIEW_REPORT.md) · [roadmap/PHASE_A_TRUST.md](roadmap/PHASE_A_TRUST.md)

---

## Executive summary

OpenAtlas is a **real-time global data intelligence dashboard** on [SpacetimeDB](https://spacetimedb.com): stateless Rust ingest → deterministic WASM reducers → Svelte 5 client over WebSocket subscriptions. Posture: **operator instrument room** (map/globe, domain desks, matrix boards).

| Layer | Maturity |
|-------|----------|
| Architecture / data plane | **Strong (late beta)** |
| STDB module + ingest | **Strong** |
| Web dashboard | **Feature-rich beta** |
| Production ops | **Early** (CI yes; automated STDB publish/rollout partial) |
| Trust / verification | **Improving** (replay scaffold; ingest auth defaults) |

Phases 1–6 in `OPENATLAS_SPEC.md` are **complete**; Phase 7 (production hardening) is **in progress**.

---

## Top risks

| # | Risk | Mitigation track |
|---|------|------------------|
| **R1** | Full-ring WS sync (~200K events) vs smaller browser-facing table | **Mitigated** — `event_recent` table implemented (300-row cap, subscribed instead of full `event` ring) — [PHASE_A_TRUST.md](roadmap/PHASE_A_TRUST.md) |
| **R2** | Ingest admin on `:8080` | Phase A: loopback bind + API key on mutating routes — [PHASE_A_TRUST.md](roadmap/PHASE_A_TRUST.md) |
| **R3** | Determinism not fully proven in CI | Phase A: replay harness → byte-identical STDB — [PHASE_A_TRUST.md](roadmap/PHASE_A_TRUST.md) |
| **R4** | Domain tag duplication (4 maps) | Phase D: `domains.toml` codegen — [PHASE_D_DEPTH.md](roadmap/PHASE_D_DEPTH.md) |
| **R5** | README / doc drift | Phase A: alignment — [x] caps fixed 2026-05-20 |

---

## Multi-phase plan (where to work)

| Phase | Doc | Horizon | Focus |
|-------|-----|---------|-------|
| **A — Trust & truth** | [PHASE_A_TRUST.md](roadmap/PHASE_A_TRUST.md) | 4–6 wk | Replay, ingest auth, sync economics, docs |
| **B — Instrument room UX** | [PHASE_B_UX.md](roadmap/PHASE_B_UX.md) | 4–6 wk | Map/globe scrub, layers, desks, nav |
| **C — Ship & observability** | [PHASE_C_SHIP.md](roadmap/PHASE_C_SHIP.md) | 3–5 wk | CD, metrics, bundle budget, a11y CI |
| **D — Depth** | [PHASE_D_DEPTH.md](roadmap/PHASE_D_DEPTH.md) | 8–12+ wk | Causal explorer, server replay, scale, feeds |

Use [`roadmap/README.md`](roadmap/README.md) for checklist conventions and verification commands.

---

## Authoritative caps (quick reference)

From `crates/openatlas-stdb-module/src/lib.rs` (not stale README):

| Table | Cap |
|-------|-----|
| `event` | **800** ring + **24h** retention |
| `signal` | **400** + 24h |
| `causal_edge` | **600** + 24h |
| `ingest_audit` | **2000** (private) |

Client projection: 24h retention + `MAX_EVENTS = 800` in `web/src/lib/data-limits.ts` (`event-retention-trim.ts`).

---

## Summary judgment

Architecture is **late beta** and unusually clear (single authority, bounded rings, registry feeds). The gap to production trust is **proof** (replay), **sync economics** (subscription vs trim), and **ops** (auth, metrics, deploy automation). Run **Phase A** in parallel with in-flight map/globe work (Phase B).

*Prior review: [REVIEW_REPORT.md](REVIEW_REPORT.md) (2026-05-19). Close items in phase docs as fixes land.*

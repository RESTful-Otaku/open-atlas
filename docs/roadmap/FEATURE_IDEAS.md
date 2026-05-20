# Feature ideas (AI & operator UX)

Condensed backlog for revolutionary / differentiation work. **Done in this slice**
is marked ✅; the rest stays deferred.

## ✅ Shipped (first slice)

| Item | Notes |
|------|-------|
| Grounded LLM snapshots | `scope_domain`, `desk_chart_stats`, top signals, causal in/out counts in `llm-snapshot.ts` |
| Hub + domain regenerate | Retry once, 120s timeouts, template fallback (`briefing-fallback.ts`) |
| Domain AI analysis strip | `DomainAnalystStrip.svelte` on domain desks |
| NL → filter stub | `nl-filter-intent.ts` — operator bar + OpsStrip pill (no LLM) |

## Deferred (later phases)

| Item | Why wait |
|------|----------|
| LLM JSON schema for NL filters | Needs validation + ops audit trail |
| Sim-time server anchor | Phase D — replace client-only scrub |
| Collaborative layouts / server prefs | Auth not in v1 |
| Signal → event one-click | Matrix wiring only partial |
| Cold archive + server replay API | Phase A replay proof first |
| Multi-agent “war room” modes | Product design |

See [PHASE_D_DEPTH.md](./PHASE_D_DEPTH.md) for causal/history/scale items.

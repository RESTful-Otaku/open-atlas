<script lang="ts">
  import type { UiEvent } from "../../types";

  interface Props {
    events: readonly UiEvent[];
    accent: string;
    title?: string;
    caption?: string;
  }
  const { events, accent, title, caption }: Props = $props();

  type Pt = { x: number; y: number; sev: number; id: string };
  const pts = $derived.by(() => {
    const out: Pt[] = [];
    for (const e of events) {
      if (!e.location) continue;
      const { lat, lon } = e.location;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const x = ((lon + 180) / 360) * 1000;
      const y = ((90 - lat) / 180) * 500;
      out.push({
        x: Math.max(8, Math.min(992, x)),
        y: Math.max(8, Math.min(492, y)),
        sev: e.severity_score,
        id: e.id,
      });
      if (out.length >= 140) break;
    }
    return out;
  });
</script>

<section class="mini-map" aria-label={title ?? "Geographic distribution"}>
  {#if title}
    <h3 class="mini-map-h">{title}</h3>
  {/if}
  {#if pts.length === 0}
    <p class="mini-map-empty">No geotagged events in this slice — try another domain or the full map.</p>
  {:else}
    <svg
      class="mini-map-svg"
      viewBox="0 0 1000 500"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="mm-grid" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="rgba(255,255,255,0.04)" />
          <stop offset="100%" stop-color="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <rect width="1000" height="500" rx="12" fill="url(#mm-grid)" stroke="rgba(255,255,255,0.08)" />
      {#each [180, 360] as lon}
        {@const x = ((lon + 180) / 360) * 1000}
        <line x1={x} y1="0" x2={x} y2="500" stroke="rgba(255,255,255,0.05)" />
      {/each}
      {#each [0, 30, -30] as la}
        {@const y = ((90 - la) / 180) * 500}
        <line x1="0" y1={y} x2="1000" y2={y} stroke="rgba(255,255,255,0.05)" />
      {/each}
      {#each pts as p (p.id)}
        <circle
          cx={p.x}
          cy={p.y}
          r={3 + p.sev * 5}
          fill={accent}
          opacity={0.25 + p.sev * 0.55}
        />
      {/each}
    </svg>
    {#if caption}
      <p class="mini-map-cap mono">{caption}</p>
    {/if}
  {/if}
</section>

<style>
  .mini-map {
    padding: 0;
  }
  .mini-map-h {
    margin: 0 0 0.5rem 0;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }
  .mini-map-empty {
    margin: 0;
    font-size: 0.82rem;
    color: var(--text-3);
    padding: var(--space-4);
    border: 1px dashed var(--border-1);
    border-radius: var(--radius);
  }
  .mini-map-svg {
    width: 100%;
    max-height: 220px;
    display: block;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--bg-0) 70%, transparent);
  }
  .mini-map-cap {
    margin: 0.35rem 0 0 0;
    font-size: 0.65rem;
    color: var(--text-muted);
  }
</style>

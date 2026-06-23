<script lang="ts">
  interface Props {
    label: string;
    /** Value expressed as a fraction in `[0, 1]`. Clamped defensively. */
    value: number;
    tone?: "accent" | "warn" | "danger" | "good";
    /** Hide the trailing "N%" label. */
    suppressPercent?: boolean;
  }

  const { label, value, tone = "accent", suppressPercent = false }: Props =
    $props();

  const clamped = $derived(Math.min(Math.max(value, 0), 1));
  const pct = $derived(Math.round(clamped * 100));
</script>

<div class="bar-badge" data-tone={tone}>
  <div class="bar-badge-row">
    <span class="bar-badge-label">{label}</span>
    {#if !suppressPercent}
      <span class="bar-badge-value mono">{pct}%</span>
    {/if}
  </div>
  <div class="bar-badge-track" aria-hidden="true">
    <div class="bar-badge-fill" style="width: {pct}%"></div>
  </div>
</div>

<style>
  .bar-badge {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .bar-badge-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    font-size: 11px;
  }
  .bar-badge-label {
    color: var(--text-2);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar-badge-value {
    color: var(--text-1);
    font-size: 10px;
  }
  .bar-badge-track {
    height: 4px;
    border-radius: var(--radius-pill);
    background: var(--overlay);
    overflow: hidden;
  }
  .bar-badge-fill {
    height: 100%;
    border-radius: var(--radius-pill);
    transition: width var(--motion-med) var(--ease);
  }

  .bar-badge[data-tone="accent"] .bar-badge-fill {
    background: linear-gradient(
      90deg,
      var(--accent) 0%,
      var(--accent-violet) 100%
    );
  }
  .bar-badge[data-tone="warn"] .bar-badge-fill {
    background: var(--status-warn);
  }
  .bar-badge[data-tone="danger"] .bar-badge-fill {
    background: var(--status-err);
  }
  .bar-badge[data-tone="good"] .bar-badge-fill {
    background: var(--status-ok);
  }
</style>

<!--
  Badge used for named numeric indices such as "GLOBAL THREAT INDEX
  7.4 / 10", "DEFCON: Elevated", or "Kessler Index: 0.14". Renders a
  label above a value + optional denominator.
-->
<script lang="ts">
  interface Props {
    label: string;
    value: string | number;
    denominator?: string | number;
    tone?: "neutral" | "warn" | "danger" | "accent";
    size?: "sm" | "md";
  }

  const {
    label,
    value,
    denominator,
    tone = "neutral",
    size = "md",
  }: Props = $props();
</script>

<span class="index" data-tone={tone} data-size={size}>
  <span class="index-label">{label}</span>
  <span class="index-value mono">
    <span class="index-main">{value}</span>
    {#if denominator !== undefined}<span class="index-denom">/ {denominator}</span>{/if}
  </span>
</span>

<style>
  .index {
    display: inline-flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 10px;
    border: 1px solid var(--border-1);
    border-radius: var(--radius-sm);
    background: var(--bg-2);
    line-height: 1;
  }
  .index-label {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-3);
  }
  .index-value {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    font-size: 16px;
    color: var(--text-1);
  }
  .index[data-size="sm"] .index-value {
    font-size: 13px;
  }
  .index-denom {
    font-size: 10px;
    color: var(--text-3);
  }
  .index[data-tone="warn"] .index-value,
  .index[data-tone="warn"] .index-main {
    color: var(--status-warn);
  }
  .index[data-tone="danger"] .index-value,
  .index[data-tone="danger"] .index-main {
    color: var(--status-err);
  }
  .index[data-tone="accent"] .index-value,
  .index[data-tone="accent"] .index-main {
    color: var(--accent);
  }
</style>

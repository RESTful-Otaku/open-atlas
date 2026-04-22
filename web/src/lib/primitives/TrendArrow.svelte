<!--
  Tiny up/down/flat trend indicator with optional numeric delta.
-->
<script lang="ts">
  import { ArrowDownRight, ArrowRight, ArrowUpRight } from "@lucide/svelte";

  interface Props {
    /** Signed delta. Positive = up, negative = down, zero = flat. */
    delta: number;
    /** Formatted label to render alongside the arrow. */
    label?: string;
    /**
     * Whether an increase is "good" (e.g. throughput) or "bad" (e.g.
     * threat index). Drives colour — green for good trends, red for bad.
     */
    direction?: "up-good" | "up-bad";
  }

  const { delta, label, direction = "up-good" }: Props = $props();

  const tone = $derived(computeTone(delta, direction));

  function computeTone(
    d: number,
    dir: "up-good" | "up-bad",
  ): "positive" | "negative" | "flat" {
    if (Math.abs(d) < 0.005) return "flat";
    const isUp = d > 0;
    if (dir === "up-good") return isUp ? "positive" : "negative";
    return isUp ? "negative" : "positive";
  }
</script>

<span class="trend" data-tone={tone}>
  {#if Math.abs(delta) < 0.005}
    <ArrowRight size={12} strokeWidth={2} />
  {:else if delta > 0}
    <ArrowUpRight size={12} strokeWidth={2} />
  {:else}
    <ArrowDownRight size={12} strokeWidth={2} />
  {/if}
  {#if label !== undefined}<span class="trend-label mono">{label}</span>{/if}
</span>

<style>
  .trend {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
  }
  .trend[data-tone="positive"] {
    color: var(--sev-low);
  }
  .trend[data-tone="negative"] {
    color: var(--sev-high);
  }
  .trend[data-tone="flat"] {
    color: var(--text-3);
  }
</style>

<script lang="ts">
  import { onMount } from "svelte";

  import { formatCompactNumber, shouldCompact } from "../format-compact-number";

  interface Props {
    value: number;
    title?: string;
    class?: string;
  }

  let { value, title: titleOverride, class: className = "" }: Props = $props();

  const formatted = $derived(formatCompactNumber(value));
  const compact = $derived(shouldCompact(value));
  const tooltip = $derived(
    titleOverride ?? (compact ? formatted.raw : undefined),
  );

  let reducedMotion = $state(false);

  onMount(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reducedMotion = mq.matches;
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  });
</script>

<span
  class={["compact-num", className].filter(Boolean).join(" ")}
  class:compact-num--hover={compact && !reducedMotion}
  title={tooltip}
  aria-label={formatted.raw}
>
  {formatted.display}
</span>

<style>
  .compact-num {
    font-variant-numeric: tabular-nums;
  }
  .compact-num--hover {
    cursor: help;
    text-decoration: underline dotted transparent;
    text-underline-offset: 2px;
  }
  .compact-num--hover:hover {
    text-decoration-color: var(--text-3);
  }
</style>

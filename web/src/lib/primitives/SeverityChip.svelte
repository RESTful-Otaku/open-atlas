<!--
  Compact severity/status chip. Colour and label map from a closed
  `SeverityLevel` enum so typos fail at compile time.
-->
<script lang="ts">
  import type { SeverityLevel } from "./status";

  interface Props {
    level: SeverityLevel;
    /** Override the default label (e.g. "Cat 4" instead of "Severe"). */
    label?: string;
    size?: "sm" | "md";
  }

  const { level, label, size = "sm" }: Props = $props();

  const DEFAULT_LABELS: Readonly<Record<SeverityLevel, string>> = {
    nominal: "Nominal",
    watch: "Watch",
    elevated: "Elevated",
    severe: "Severe",
    critical: "Critical",
    ongoing: "Ongoing",
  };

  const resolvedLabel = $derived(label ?? DEFAULT_LABELS[level]);
</script>

<span class="chip" data-level={level} data-size={size}>
  {resolvedLabel}
</span>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px 8px;
    border-radius: var(--radius-xs);
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 500;
    text-transform: lowercase;
    letter-spacing: 0.04em;
    border: 1px solid transparent;
    color: var(--text-1);
    white-space: nowrap;
  }
  .chip[data-size="md"] {
    font-size: 11px;
    padding: 3px 10px;
  }

  .chip[data-level="nominal"] {
    color: var(--sev-low);
    background: rgba(34, 197, 94, 0.12);
    border-color: rgba(34, 197, 94, 0.3);
  }
  .chip[data-level="watch"] {
    color: #67e8f9;
    background: rgba(34, 211, 238, 0.12);
    border-color: rgba(34, 211, 238, 0.3);
  }
  .chip[data-level="elevated"] {
    color: var(--sev-mid);
    background: rgba(245, 158, 11, 0.14);
    border-color: rgba(245, 158, 11, 0.3);
  }
  .chip[data-level="severe"] {
    color: #fb7185;
    background: rgba(251, 113, 133, 0.14);
    border-color: rgba(251, 113, 133, 0.3);
  }
  .chip[data-level="critical"] {
    color: var(--sev-critical);
    background: rgba(244, 63, 94, 0.16);
    border-color: rgba(244, 63, 94, 0.4);
  }
  .chip[data-level="ongoing"] {
    color: var(--accent-violet);
    background: rgba(167, 139, 250, 0.14);
    border-color: rgba(167, 139, 250, 0.3);
  }
</style>

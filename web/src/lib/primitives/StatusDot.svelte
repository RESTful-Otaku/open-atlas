<script lang="ts">
  import type { StatusLevel } from "./status";

  interface Props {
    level: StatusLevel;
    label?: string;
    pulse?: boolean;
  }

  const { level, label, pulse = false }: Props = $props();

  const DEFAULT_LABELS: Readonly<Record<StatusLevel, string>> = {
    nominal: "NOMINAL",
    optimal: "OPTIMAL",
    stable: "STABLE",
    active: "ACTIVE",
    warning: "WARNING",
    elevated: "ELEVATED",
    degraded: "DEGRADED",
    critical: "CRITICAL",
    "active-conflict": "ACTIVE CONFLICT",
    offline: "OFFLINE",
  };

  const resolvedLabel = $derived(label ?? DEFAULT_LABELS[level]);
</script>

<span class="status" data-level={level} data-pulse={pulse ? "on" : "off"}>
  <span class="status-dot" aria-hidden="true"></span>
  <span class="status-label">{resolvedLabel}</span>
</span>

<style>
  .status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-2);
  }
  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-muted);
  }

  .status[data-level="nominal"] .status-dot,
  .status[data-level="optimal"] .status-dot,
  .status[data-level="stable"] .status-dot {
    background: var(--status-ok);
  }
  .status[data-level="active"] .status-dot {
    background: var(--accent);
  }
  .status[data-level="warning"] .status-dot,
  .status[data-level="elevated"] .status-dot,
  .status[data-level="degraded"] .status-dot {
    background: var(--status-warn);
  }
  .status[data-level="critical"] .status-dot,
  .status[data-level="active-conflict"] .status-dot {
    background: var(--status-err);
  }

  .status[data-level="nominal"],
  .status[data-level="optimal"],
  .status[data-level="stable"] {
    color: var(--sev-low);
  }
  .status[data-level="warning"],
  .status[data-level="elevated"],
  .status[data-level="degraded"] {
    color: var(--sev-mid);
  }
  .status[data-level="critical"],
  .status[data-level="active-conflict"] {
    color: var(--sev-high);
  }
  .status[data-level="active"] {
    color: var(--accent);
  }

  .status[data-pulse="on"] .status-dot {
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.05);
    animation: status-pulse 1.8s ease-in-out infinite;
  }

  @keyframes status-pulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.25);
      opacity: 0.75;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .status[data-pulse="on"] .status-dot {
      animation: none;
    }
  }
</style>

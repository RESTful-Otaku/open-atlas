<script lang="ts">
  import { Clock, Moon, Sun, Sunrise, Sunset } from "@lucide/svelte";
  import {
    formatUtcTimeLabel,
    scrubPercent,
    solarPhaseForMin,
    SOLAR_TRACK_GRADIENT,
    type SimMinOfDay,
  } from "../map/solar-time-scrub";

  interface Props {
    minOfDay: SimMinOfDay;
    /** Full ISO-ish label from parent (date + time). */
    utcLabel?: string;
    onNow?: () => void;
  }

  let { minOfDay = $bindable(0), utcLabel = "", onNow }: Props = $props();

  const pct = $derived(scrubPercent(minOfDay));
  const clock = $derived(formatUtcTimeLabel(minOfDay));
  const phase = $derived(solarPhaseForMin(minOfDay));
  const trackStyle = $derived(
    `--solar-pct: ${pct}%; background: ${SOLAR_TRACK_GRADIENT}`,
  );
</script>

<div class="solar-scrub" role="group" aria-label="Simulated UTC time of day">
  <div class="solar-scrub-head">
    <span class="solar-scrub-phase">
      {#if phase.icon === "moon"}
        <Moon size={14} strokeWidth={1.75} aria-hidden="true" />
      {:else if phase.icon === "sunrise"}
        <Sunrise size={14} strokeWidth={1.75} aria-hidden="true" />
      {:else if phase.icon === "sunset"}
        <Sunset size={14} strokeWidth={1.75} aria-hidden="true" />
      {:else}
        <Sun size={14} strokeWidth={1.75} aria-hidden="true" />
      {/if}
      <span>{phase.label}</span>
    </span>
    <span class="solar-scrub-clock" title={utcLabel || undefined}>
      <Clock size={13} strokeWidth={1.75} aria-hidden="true" />
      <time>{clock}</time>
      <span class="solar-scrub-tz">UTC</span>
    </span>
    {#if onNow}
      <button type="button" class="solar-scrub-now" onclick={onNow} title="Jump to current UTC time">
        Now
      </button>
    {/if}
  </div>

  <div class="solar-scrub-track-wrap" style={trackStyle}>
    <div class="solar-scrub-burst" aria-hidden="true"></div>
    <div class="solar-scrub-glow" aria-hidden="true"></div>
    <input
      class="solar-scrub-range"
      type="range"
      min="0"
      max="1439"
      bind:value={minOfDay}
      aria-valuetext="{clock} UTC — {phase.label}"
      aria-label="Scrub simulated time of day"
    />
  </div>
  <div class="solar-scrub-ticks" aria-hidden="true">
    <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
  </div>
</div>

<style>
  .solar-scrub {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: min(100%, 20rem);
  }
  .solar-scrub-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  .solar-scrub-phase {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-2);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .solar-scrub-clock {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 15px;
    font-weight: 600;
    color: var(--text-1);
    letter-spacing: 0.02em;
  }
  .solar-scrub-clock time {
    font-variant-numeric: tabular-nums;
  }
  .solar-scrub-tz {
    font-size: 10px;
    font-weight: 500;
    color: var(--text-3);
  }
  .solar-scrub-now {
    font-size: 10px;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: calc(var(--radius) - 2px);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-2);
    cursor: pointer;
    transition:
      background 0.18s ease,
      border-color 0.18s ease,
      color 0.18s ease;
  }
  .solar-scrub-now:hover {
    color: var(--text-1);
    border-color: var(--border-2);
    background: var(--bg-3);
  }

  .solar-scrub-track-wrap {
    position: relative;
    height: 32px;
    border-radius: 999px;
    overflow: hidden;
    box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.35);
  }
  .solar-scrub-burst {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      ellipse 42% 180% at var(--solar-pct) 50%,
      rgba(255, 248, 220, 0.42) 0%,
      rgba(255, 200, 100, 0.18) 28%,
      transparent 62%
    );
    pointer-events: none;
    transition: background 0.35s ease;
  }
  .solar-scrub-glow {
    position: absolute;
    top: 50%;
    left: var(--solar-pct);
    width: 56px;
    height: 56px;
    transform: translate(-50%, -50%);
    background: radial-gradient(
      circle,
      rgba(255, 235, 160, 0.75) 0%,
      rgba(255, 180, 60, 0.25) 35%,
      transparent 68%
    );
    pointer-events: none;
    transition: left 0.12s ease-out;
    mix-blend-mode: screen;
  }
  .solar-scrub-range {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    z-index: 2;
  }
  .solar-scrub-range::-webkit-slider-runnable-track {
    height: 32px;
    background: transparent;
  }
  .solar-scrub-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    margin-top: 7px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.9);
    background: radial-gradient(circle at 35% 35%, #fff9e6, #fbbf24 55%, #ea580c);
    box-shadow:
      0 0 12px rgba(255, 220, 120, 0.9),
      0 2px 6px rgba(0, 0, 0, 0.35);
    transition: transform 0.12s ease;
  }
  .solar-scrub-range:active::-webkit-slider-thumb {
    transform: scale(1.12);
  }
  .solar-scrub-range::-moz-range-track {
    height: 32px;
    background: transparent;
    border: none;
  }
  .solar-scrub-range::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.9);
    background: radial-gradient(circle at 35% 35%, #fff9e6, #fbbf24 55%, #ea580c);
    box-shadow:
      0 0 12px rgba(255, 220, 120, 0.9),
      0 2px 6px rgba(0, 0, 0, 0.35);
  }

  .solar-scrub-ticks {
    display: flex;
    justify-content: space-between;
    padding: 0 2px;
    font-size: 9px;
    font-family: var(--font-mono);
    color: var(--text-3);
    user-select: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .solar-scrub-burst,
    .solar-scrub-glow,
    .solar-scrub-range::-webkit-slider-thumb {
      transition: none;
    }
  }
</style>

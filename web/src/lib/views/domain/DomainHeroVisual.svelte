<script lang="ts">
  import type { DeskProfile } from "./domain-desk-types";

  interface Props {
    profile: DeskProfile;
    accent: string;
    label: string;
  }
  const { profile, accent, label }: Props = $props();
</script>

<figure
  class="hero-vis hero-vis--{profile}"
  style:--hv-accent={accent}
  aria-label={`Synthetic ${label} instrument strip`}
>
  <figcaption class="vis-cap">
    <span class="vis-cap-dot" aria-hidden="true"></span>
    Live mock · {label}
  </figcaption>
  <div class="vis-frame">
    <div class="vis-grid" aria-hidden="true"></div>
    <div class="vis-sweep" aria-hidden="true"></div>
    <div class="vis-wave" aria-hidden="true"></div>
    <div class="vis-label mono" aria-hidden="true">
      {profile.split("_").join(" · ")}
    </div>
  </div>
</figure>

<style>
  .hero-vis {
    margin: 0;
    width: min(100%, 22rem);
    flex-shrink: 0;
  }
  .vis-cap {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    margin: 0 0 0.35rem 0;
  }
  .vis-cap-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--hv-accent);
    box-shadow: 0 0 10px color-mix(in srgb, var(--hv-accent) 70%, transparent);
    animation: vis-pulse 2.4s ease-in-out infinite;
  }
  @keyframes vis-pulse {
    0%,
    100% {
      opacity: 0.55;
    }
    50% {
      opacity: 1;
    }
  }
  .vis-frame {
    position: relative;
    height: 118px;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-1);
    overflow: hidden;
    background: linear-gradient(
      165deg,
      color-mix(in srgb, var(--hv-accent) 12%, var(--bg-0)) 0%,
      var(--bg-1) 55%,
      var(--bg-0) 100%
    );
  }
  .vis-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
    background-size: 14px 14px;
    opacity: 0.55;
  }
  .vis-sweep {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      105deg,
      transparent 40%,
      color-mix(in srgb, var(--hv-accent) 22%, transparent) 50%,
      transparent 60%
    );
    animation: vis-sweep 4.5s linear infinite;
  }
  @keyframes vis-sweep {
    0% {
      transform: translateX(-40%);
    }
    100% {
      transform: translateX(40%);
    }
  }
  .vis-wave {
    position: absolute;
    left: 6%;
    right: 6%;
    bottom: 18%;
    height: 32%;
    border-radius: 4px;
    background: color-mix(in srgb, var(--hv-accent) 35%, transparent);
    opacity: 0.35;
    mask-image: radial-gradient(120% 120% at 50% 100%, #000 55%, transparent 70%);
    animation: vis-wave 3.2s ease-in-out infinite alternate;
  }
  @keyframes vis-wave {
    from {
      transform: scaleY(0.55);
    }
    to {
      transform: scaleY(1);
    }
  }
  .vis-label {
    position: absolute;
    left: 8px;
    bottom: 6px;
    font-size: 0.58rem;
    color: rgba(228, 228, 231, 0.45);
    max-width: 92%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hero-vis--markets .vis-wave {
    clip-path: polygon(0 100%, 4% 40%, 12% 70%, 22% 20%, 34% 55%, 48% 15%, 60% 50%, 74% 25%, 86% 60%, 100% 35%, 100% 100%);
    border-radius: 0;
    opacity: 0.5;
  }
  .hero-vis--defensive_digital .vis-grid {
    background-size: 22px 22px;
    opacity: 0.35;
  }
  .hero-vis--orbital_regime .vis-wave {
    border-radius: 50%;
    width: 42%;
    height: 52%;
    left: 29%;
    bottom: 12%;
    opacity: 0.4;
  }
  .hero-vis--life_sciences .vis-sweep {
    animation-duration: 6s;
    opacity: 0.55;
  }
  .hero-vis--human_systems .vis-grid {
    background-size: 18px 26px;
  }
  .hero-vis--geopolitical_layer .vis-wave {
    opacity: 0.28;
    filter: blur(0.5px);
  }
</style>

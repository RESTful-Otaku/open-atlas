<script lang="ts">
  interface Props {
    values: readonly number[];
    color?: string;
    height?: number;
    width?: number;
    strokeWidth?: number;
    padding?: number;
  }

  let {
    values,
    color = "var(--accent)",
    height = 36,
    width = 240,
    strokeWidth = 1.6,
    padding = 2,
  }: Props = $props();

  type Path = { kind: "line"; points: string } | { kind: "flat" };

  function pointsFor(
    series: readonly number[],
    w: number,
    h: number,
    pad: number,
  ): Path {
    if (series.length < 2) return { kind: "flat" };
    const min = Math.min(...series);
    const max = Math.max(...series);
    const range = Math.max(max - min, 0.0001);
    const step = (w - pad * 2) / Math.max(series.length - 1, 1);
    const coords: string[] = [];
    for (let i = 0; i < series.length; i += 1) {
      const x = pad + step * i;
      const normalised = ((series[i] ?? min) - min) / range;
      const y = pad + (1 - normalised) * (h - pad * 2);
      coords.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return { kind: "line", points: coords.join(" ") };
  }

  const path = $derived(pointsFor(values, width, height, padding));
</script>

<svg
  class="sparkline"
  viewBox={`0 0 ${width} ${height}`}
  preserveAspectRatio="none"
  role="img"
  aria-label="sparkline"
>
  {#if path.kind === "line"}
    <polyline
      fill="none"
      stroke={color}
      stroke-width={strokeWidth}
      stroke-linejoin="round"
      stroke-linecap="round"
      points={path.points}
    />
  {:else}
    <line
      x1="0"
      y1={height / 2}
      x2={width}
      y2={height / 2}
      stroke={color}
      stroke-opacity="0.25"
      stroke-width="1.2"
      stroke-dasharray="2 3"
    />
  {/if}
</svg>

<style>
  .sparkline {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>

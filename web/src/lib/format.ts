

export function fmtFixed(value: number, digits: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function severityPercent(score: number): number {
  return clamp(score, 0, 1) * 100;
}


export function shortId(id: string, length = 8): string {
  const head = id.split("-")[0] ?? id;
  return head.slice(0, length);
}


export function shortTime(timestamp: string): string {
  const afterT = timestamp.includes("T") ? timestamp.split("T")[1] : timestamp;
  const beforeDot = afterT?.split(".")[0];
  return beforeDot ?? timestamp;
}


export function trendLabel(trend: string): string {
  switch (trend) {
    case "up":
      return "Rising";
    case "down":
      return "Easing";
    case "flat":
      return "Stable";
    default:
      return "No data";
  }
}

export function trendGlyph(trend: string): string {
  switch (trend) {
    case "up":
      return "▲";
    case "down":
      return "▼";
    case "flat":
      return "●";
    default:
      return "◌";
  }
}


export function computeTrend(series: readonly number[]): "up" | "down" | "flat" | "insufficient-data" {
  if (series.length < 3) return "insufficient-data";
  const tail = series[series.length - 1]!;
  const head = series[series.length - 3]!;
  const delta = tail - head;
  if (delta > 0.05) return "up";
  if (delta < -0.05) return "down";
  return "flat";
}

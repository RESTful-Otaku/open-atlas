

const K = 1_000;
const M = 1_000_000;
const B = 1_000_000_000;

export function shouldCompact(n: number): boolean {
  return Number.isFinite(n) && Math.abs(n) >= K;
}

function formatFullNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US").format(Math.trunc(n));
}

export interface CompactNumberFormatted {
  readonly display: string;

  readonly raw: string;
}

export function formatCompactNumber(n: number): CompactNumberFormatted {
  if (!Number.isFinite(n)) {
    return { display: "—", raw: "—" };
  }

  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const raw = formatFullNumber(n);

  if (abs < K) {
    return { display: sign + String(Math.trunc(abs)), raw };
  }
  if (abs < M) {
    return { display: `${sign}${(abs / K).toFixed(1)}k`, raw };
  }
  if (abs < B) {
    return { display: `${sign}${(abs / M).toFixed(2)}m`, raw };
  }
  return { display: `${sign}${(abs / B).toFixed(2)}b`, raw };
}

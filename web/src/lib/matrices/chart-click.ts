
import { DOMAIN_CATALOG, domainLabel } from "../colors";

export type ChartInteractionPayload = {
  readonly seriesType?: string;
  readonly name?: string;
  readonly data?: unknown;
  readonly dataIndex?: number;
};

export function resolveDomainFromChartClick(
  scopeDomains: readonly string[],
  raw: unknown,
): string | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as ChartInteractionPayload;
  const set = new Set(scopeDomains);

  if (p.seriesType === "heatmap" && Array.isArray(p.data)) {
    const row = (p.data as number[])[1];
    if (typeof row === "number") {
      const id = scopeDomains[row];
      if (id !== undefined && set.has(id)) return id;
    }
  }

  if (typeof p.name === "string" && set.has(p.name)) return p.name;

  if (typeof p.name === "string") {
    const byLabel = DOMAIN_CATALOG.find((d) => domainLabel(d.id) === p.name);
    if (byLabel && set.has(byLabel.id)) return byLabel.id;
  }

  return null;
}

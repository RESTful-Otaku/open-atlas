import type { PanelLayoutState } from "./panel-layout-types";

/**
 * Merges stored layout with catalog defaults. Drops unknown ids, appends
 * new ids in default order, and fills missing spans.
 */
export function mergePanelLayout(
  stored: PanelLayoutState | null,
  defaultOrder: readonly string[],
  defaultSpans: Readonly<Record<string, number>>,
): PanelLayoutState {
  const dOrder = [...defaultOrder];
  const dSet = new Set(dOrder);
  const sOrder = stored?.order ? [...stored.order] : [];
  const seen = new Set<string>();
  const order: string[] = [];

  for (const id of sOrder) {
    if (!dSet.has(id) || seen.has(id)) continue;
    order.push(id);
    seen.add(id);
  }
  for (const id of dOrder) {
    if (!seen.has(id)) {
      order.push(id);
      seen.add(id);
    }
  }

  const spans: Record<string, number> = { ...defaultSpans };
  if (stored?.spans) {
    for (const [k, v] of Object.entries(stored.spans)) {
      if (dSet.has(k) && Number.isFinite(v) && v > 0) {
        spans[k] = v;
      }
    }
  }
  for (const id of dOrder) {
    if (spans[id] === undefined) spans[id] = defaultSpans[id] ?? 1;
  }

  return { order, spans };
}

/**
 * Move `fromId` to the slot currently occupied by `toId` (same semantics as
 * drag-drop reorder between two panels).
 */
export function reorderBetween(
  order: readonly string[],
  fromId: string,
  toId: string,
): string[] {
  if (fromId === toId) return [...order];
  const o = [...order];
  const i = o.indexOf(fromId);
  const j = o.indexOf(toId);
  if (i < 0 || j < 0) return o;
  o.splice(i, 1);
  o.splice(j, 0, fromId);
  return o;
}

export function moveId(
  order: readonly string[],
  id: string,
  dir: -1 | 1,
): string[] {
  const i = order.indexOf(id);
  if (i < 0) return [...order];
  const j = i + dir;
  if (j < 0 || j >= order.length) return [...order];
  const out = [...order];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

export function setSpan(
  spans: Readonly<Record<string, number>>,
  id: string,
  n: number,
  min: number,
  max: number,
): Record<string, number> {
  const v = Math.min(max, Math.max(min, Math.round(n)));
  return { ...spans, [id]: v };
}

/**
 * Persisted grid layout for domain desk charts (order + column span per panel).
 */

export const LAYOUT_STORAGE_VERSION = 1 as const;

export type ColSpan = 1 | 2 | 3;

export interface DomainChartLayout {
  readonly version: typeof LAYOUT_STORAGE_VERSION;
  /** Permutation of `0 .. panelCount-1` — render order. */
  readonly order: readonly number[];
  /** Column span (1–3) keyed by original panel index from `deskChartPack`. */
  readonly spanByIndex: Readonly<Record<number, ColSpan>>;
}

export function layoutStorageKey(profile: string, domainId: string): string {
  return `openatlas:domainChartLayout:v${LAYOUT_STORAGE_VERSION}:${profile}:${domainId}`;
}

export function defaultLayout(panelCount: number): DomainChartLayout {
  return {
    version: LAYOUT_STORAGE_VERSION,
    order: Object.freeze(Array.from({ length: panelCount }, (_, i) => i)),
    spanByIndex: Object.freeze({}),
  };
}

function isColSpan(n: number): n is ColSpan {
  return n === 1 || n === 2 || n === 3;
}

/** Merge stored layout when panel count or indices drift (app updates). */
export function reconcileLayout(
  stored: DomainChartLayout | null,
  panelCount: number,
): DomainChartLayout {
  if (!stored || stored.version !== LAYOUT_STORAGE_VERSION) {
    return defaultLayout(panelCount);
  }
  const seen = new Set<number>();
  const order: number[] = [];
  for (const i of stored.order) {
    if (i >= 0 && i < panelCount && !seen.has(i)) {
      seen.add(i);
      order.push(i);
    }
  }
  for (let i = 0; i < panelCount; i += 1) {
    if (!seen.has(i)) order.push(i);
  }
  const spanByIndex: Record<number, ColSpan> = {};
  for (const [k, v] of Object.entries(stored.spanByIndex)) {
    const idx = Number(k);
    if (idx >= 0 && idx < panelCount && isColSpan(v)) {
      spanByIndex[idx] = v;
    }
  }
  return {
    version: LAYOUT_STORAGE_VERSION,
    order: Object.freeze(order),
    spanByIndex: Object.freeze(spanByIndex),
  };
}

export function parseLayoutJson(raw: string | null): DomainChartLayout | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const version = o.version;
    const order = o.order;
    const spanByIndex = o.spanByIndex;
    if (version !== LAYOUT_STORAGE_VERSION) return null;
    if (!Array.isArray(order) || !order.every((x) => typeof x === "number")) return null;
    if (spanByIndex !== undefined && typeof spanByIndex !== "object") return null;
    return {
      version: LAYOUT_STORAGE_VERSION,
      order: Object.freeze(order),
      spanByIndex: Object.freeze(
        spanByIndex && typeof spanByIndex === "object" && spanByIndex !== null
          ? (spanByIndex as Record<number, ColSpan>)
          : {},
      ),
    };
  } catch {
    return null;
  }
}

export function loadLayout(
  profile: string,
  domainId: string,
  panelCount: number,
): DomainChartLayout {
  if (typeof localStorage === "undefined") {
    return defaultLayout(panelCount);
  }
  const raw = localStorage.getItem(layoutStorageKey(profile, domainId));
  return reconcileLayout(parseLayoutJson(raw), panelCount);
}

export function saveLayout(
  profile: string,
  domainId: string,
  layout: DomainChartLayout,
): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    layoutStorageKey(profile, domainId),
    JSON.stringify({
      version: layout.version,
      order: [...layout.order],
      spanByIndex: { ...layout.spanByIndex },
    }),
  );
}

export function clearSavedLayout(profile: string, domainId: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(layoutStorageKey(profile, domainId));
}

export function cycleSpan(current: ColSpan): ColSpan {
  return current === 1 ? 2 : current === 2 ? 3 : 1;
}

export function spanForIndex(layout: DomainChartLayout, origIndex: number): ColSpan {
  return layout.spanByIndex[origIndex] ?? 1;
}

/** Move index `from` to visual slot `to` in permutation `order`. */
export function reorderOrder(order: readonly number[], from: number, to: number): number[] {
  if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) {
    return [...order];
  }
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function withViewTransition(run: () => void): void {
  if (typeof document === "undefined") {
    run();
    return;
  }
  const doc = document as typeof document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };
  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(() => {
      run();
    });
  } else {
    run();
  }
}

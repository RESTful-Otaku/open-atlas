import type { PanelLayoutState } from "./panel-layout-types";

const PREFIX = "openatlas-panels:";

function key(layoutKey: string): string {
  return `${PREFIX}${layoutKey}`;
}

export function readPanelLayoutJson(layoutKey: string): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(key(layoutKey));
  } catch {
    return null;
  }
}

export function writePanelLayoutJson(layoutKey: string, json: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(key(layoutKey), json);
  } catch {
    /* quota / private */
  }
}

export function loadPanelLayout(layoutKey: string): PanelLayoutState | null {
  const raw = readPanelLayoutJson(layoutKey);
  if (raw == null) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (o === null || typeof o !== "object") return null;
    const rec = o as Record<string, unknown>;
    if (!Array.isArray(rec.order)) return null;
    if (rec.spans === null || typeof rec.spans !== "object") return null;
    const order = rec.order.map((x) => String(x));
    const spans: Record<string, number> = {};
    for (const [k, v] of Object.entries(
      rec.spans as Record<string, unknown>,
    )) {
      if (typeof v === "number" && Number.isFinite(v)) spans[k] = v;
    }
    return { order, spans };
  } catch {
    return null;
  }
}

export function savePanelLayout(
  layoutKey: string,
  state: PanelLayoutState,
): void {
  try {
    writePanelLayoutJson(layoutKey, JSON.stringify(state));
  } catch {
    /* */
  }
}

export function clearPanelLayout(layoutKey: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(key(layoutKey));
  } catch {
    /* */
  }
}

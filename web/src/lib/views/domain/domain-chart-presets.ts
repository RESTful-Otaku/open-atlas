/**
 * Named layout presets for domain desk charts (browser localStorage).
 */

import {
  defaultLayout,
  layoutStorageKey,
  LAYOUT_STORAGE_VERSION,
  type ColSpan,
  type DomainChartLayout,
} from "./domain-chart-layout";

export const PRESET_STORAGE_VERSION = 1 as const;

export type BuiltInPresetId = "analyst" | "executive";

export interface NamedLayoutPreset {
  readonly version: typeof PRESET_STORAGE_VERSION;
  readonly name: string;
  readonly savedAt: string;
  readonly layout: DomainChartLayout;
}

export function builtInPresetLayout(
  presetId: BuiltInPresetId,
  panelCount: number,
): DomainChartLayout {
  const base = defaultLayout(panelCount);
  const spanByIndex: Record<number, ColSpan> = {};
  if (presetId === "analyst") {
    for (let i = 0; i < panelCount; i += 1) {
      spanByIndex[i] = i === 0 ? 3 : i === 1 ? 2 : 1;
    }
    return {
      version: LAYOUT_STORAGE_VERSION,
      order: base.order,
      spanByIndex: Object.freeze(spanByIndex),
    };
  }
  for (let i = 0; i < panelCount; i += 1) {
    spanByIndex[i] = 1;
  }
  return {
    version: LAYOUT_STORAGE_VERSION,
    order: base.order,
    spanByIndex: Object.freeze(spanByIndex),
  };
}

function namedPresetsKey(profile: string, domainId: string): string {
  return `${layoutStorageKey(profile, domainId)}:presets:v${PRESET_STORAGE_VERSION}`;
}

export function listNamedPresets(profile: string, domainId: string): NamedLayoutPreset[] {
  if (typeof localStorage === "undefined") return [];
  const raw = localStorage.getItem(namedPresetsKey(profile, domainId));
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: NamedLayoutPreset[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      if (o.version !== PRESET_STORAGE_VERSION) continue;
      if (typeof o.name !== "string" || !o.name.trim()) continue;
      const layout = o.layout;
      if (!layout || typeof layout !== "object") continue;
      const l = layout as DomainChartLayout;
      if (l.version !== LAYOUT_STORAGE_VERSION || !Array.isArray(l.order)) continue;
      out.push({
        version: PRESET_STORAGE_VERSION,
        name: o.name.trim(),
        savedAt: typeof o.savedAt === "string" ? o.savedAt : "",
        layout: {
          version: LAYOUT_STORAGE_VERSION,
          order: Object.freeze([...l.order]),
          spanByIndex: Object.freeze({ ...(l.spanByIndex ?? {}) }),
        },
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function saveNamedPreset(
  profile: string,
  domainId: string,
  name: string,
  layout: DomainChartLayout,
): void {
  if (typeof localStorage === "undefined") return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const existing = listNamedPresets(profile, domainId).filter((p) => p.name !== trimmed);
  const next: NamedLayoutPreset[] = [
    {
      version: PRESET_STORAGE_VERSION,
      name: trimmed,
      savedAt: new Date().toISOString(),
      layout: {
        version: layout.version,
        order: Object.freeze([...layout.order]),
        spanByIndex: Object.freeze({ ...layout.spanByIndex }),
      },
    },
    ...existing,
  ].slice(0, 8);
  localStorage.setItem(namedPresetsKey(profile, domainId), JSON.stringify(next));
}

export function deleteNamedPreset(profile: string, domainId: string, name: string): void {
  if (typeof localStorage === "undefined") return;
  const trimmed = name.trim();
  const next = listNamedPresets(profile, domainId).filter((p) => p.name !== trimmed);
  localStorage.setItem(namedPresetsKey(profile, domainId), JSON.stringify(next));
}

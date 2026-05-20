import { describe, expect, test } from "bun:test";

import { LAYOUT_STORAGE_VERSION } from "./domain-chart-layout";
import {
  builtInPresetLayout,
  listNamedPresets,
  saveNamedPreset,
} from "./domain-chart-presets";

describe("domain-chart-presets", () => {
  test("analyst preset widens first panels", () => {
    const L = builtInPresetLayout("analyst", 4);
    expect(L.spanByIndex[0]).toBe(3);
    expect(L.spanByIndex[1]).toBe(2);
    expect(L.order.length).toBe(4);
  });

  test("executive preset uses single-column spans", () => {
    const L = builtInPresetLayout("executive", 3);
    expect(L.spanByIndex[0]).toBe(1);
    expect(L.spanByIndex[2]).toBe(1);
  });

  test("saveNamedPreset round-trips in memory storage shim", () => {
    const store = new Map<string, string>();
    const orig = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });
    try {
      const layout = builtInPresetLayout("analyst", 2);
      saveNamedPreset("ops", "cyber", "My desk", layout);
      const listed = listNamedPresets("ops", "cyber");
      expect(listed.length).toBe(1);
      expect(listed[0]?.name).toBe("My desk");
      expect(listed[0]?.layout.version).toBe(LAYOUT_STORAGE_VERSION);
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: orig,
      });
    }
  });
});

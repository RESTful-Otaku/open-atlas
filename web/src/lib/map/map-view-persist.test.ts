import { describe, expect, test } from "bun:test";
import {
  allDomainIds,
  defaultMapViewState,
  isMapDomainEnabled,
  loadMapViewState,
  mapDomainsActiveLabel,
  saveMapViewState,
} from "./map-view-persist";

describe("map-view-persist", () => {
  test("defaultMapViewState has no domains enabled", () => {
    const d = defaultMapViewState();
    expect(d.domains.size).toBe(0);
    expect(d.pins).toEqual([]);
    expect(d.mode).toBe("points");
    expect(allDomainIds().length).toBeGreaterThan(0);
  });

  test("empty set means no domain enabled", () => {
    const none = defaultMapViewState().domains;
    expect(isMapDomainEnabled(none, allDomainIds()[0]!)).toBe(false);
    expect(mapDomainsActiveLabel(none)).toBe("None");
  });

  test("round-trip save and load", () => {
    const store = new Map<string, string>();
    const orig = globalThis.sessionStorage;
    Object.defineProperty(globalThis, "sessionStorage", {
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
      const state = defaultMapViewState();
      state.domains = new Set(["energy", "climate"]);
      state.mode = "both";
      state.showCausal = true;
      state.showWeatherOverlays = true;
      state.pins = [{ eventId: "42", x: 100, y: 200 }];
      state.simMinOfDay = 90;
      saveMapViewState(state);
      const loaded = loadMapViewState();
      expect([...loaded.domains].sort()).toEqual(["climate", "energy"]);
      expect(loaded.mode).toBe("both");
      expect(loaded.showCausal).toBe(true);
      expect(loaded.showWeatherOverlays).toBe(true);
      expect(loaded.pins).toEqual([{ eventId: "42", x: 100, y: 200 }]);
      expect(loaded.simMinOfDay).toBe(90);
    } finally {
      Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        value: orig,
      });
    }
  });
});

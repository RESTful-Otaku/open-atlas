import { describe, expect, test } from "vitest";

import {
  MAX_MAP_PINS_DESKTOP,
  togglePinInspector,
  unpinInspector,
  unpinLastInspector,
} from "./map-pinned-inspectors";

const pin = (id: string): { eventId: string; x: number; y: number } => ({
  eventId: id,
  x: 10,
  y: 20,
});

describe("togglePinInspector", () => {
  test("desktop allows up to three distinct pins", () => {
    let pins: ReturnType<typeof pin>[] = [];
    for (const id of ["a", "b", "c"]) {
      const r = togglePinInspector(pins, pin(id), false);
      expect(r.ok).toBe(true);
      if (r.ok) pins = r.pins;
    }
    expect(pins).toHaveLength(MAX_MAP_PINS_DESKTOP);
    const fourth = togglePinInspector(pins, pin("d"), false);
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) expect(fourth.reason).toBe("max_pins");
  });

  test("toggle removes an existing pin", () => {
    const r1 = togglePinInspector([], pin("a"), false);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const r2 = togglePinInspector(r1.pins, pin("a"), false);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.unpinned).toBe(true);
      expect(r2.pins).toHaveLength(0);
    }
  });

  test("compact replaces the single slot", () => {
    const r1 = togglePinInspector([], pin("a"), true);
    const r2 = togglePinInspector(r1.ok ? r1.pins : [], pin("b"), true);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.pins).toHaveLength(1);
      expect(r2.pins[0]?.eventId).toBe("b");
    }
  });
});

describe("unpin helpers", () => {
  test("unpinInspector removes by id", () => {
    const pins = [pin("a"), pin("b")];
    expect(unpinInspector(pins, "a")).toHaveLength(1);
  });

  test("unpinLastInspector pops the most recent", () => {
    const pins = [pin("a"), pin("b")];
    expect(unpinLastInspector(pins).map((p) => p.eventId)).toEqual(["a"]);
  });
});

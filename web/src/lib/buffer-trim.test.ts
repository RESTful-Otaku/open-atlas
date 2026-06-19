import { describe, expect, test } from "bun:test";
import { sameOrderedEvents, sameOrderedIds } from "./buffer-trim";

describe("buffer-trim", () => {
  describe("sameOrderedIds", () => {
    test("detects id changes", () => {
      const a = [{ id: "1" }, { id: "2" }];
      const b = [{ id: "1" }, { id: "2" }];
      const c = [{ id: "1" }, { id: "3" }];
      expect(sameOrderedIds(a, b)).toBe(true);
      expect(sameOrderedIds(a, c)).toBe(false);
    });

    test("returns true for two empty arrays", () => {
      expect(sameOrderedIds([], [])).toBe(true);
    });

    test("returns true for single-element arrays with same id", () => {
      expect(sameOrderedIds([{ id: "1" }], [{ id: "1" }])).toBe(true);
    });

    test("returns false for single-element arrays with different id", () => {
      expect(sameOrderedIds([{ id: "1" }], [{ id: "2" }])).toBe(false);
    });

    test("returns false when arrays have different lengths", () => {
      const a = [{ id: "1" }, { id: "2" }];
      const b = [{ id: "1" }];
      expect(sameOrderedIds(a, b)).toBe(false);
      expect(sameOrderedIds(b, a)).toBe(false);
    });

    test("returns false when same ids but different order", () => {
      const a = [{ id: "1" }, { id: "2" }];
      const b = [{ id: "2" }, { id: "1" }];
      expect(sameOrderedIds(a, b)).toBe(false);
    });

    test("reference equality not required — structural comparison", () => {
      const item = { id: "1" };
      const a = [item];
      const b = [{ id: "1" }];
      expect(sameOrderedIds(a, b)).toBe(true);
      expect(a[0]).toBe(item);
      expect(b[0]).not.toBe(item);
    });
  });

  describe("sameOrderedEvents", () => {
    test("compares ordinal", () => {
      const a = [{ id: "1", ordinal: 10 }];
      const b = [{ id: "1", ordinal: 10 }];
      const c = [{ id: "1", ordinal: 11 }];
      expect(sameOrderedEvents(a, b)).toBe(true);
      expect(sameOrderedEvents(a, c)).toBe(false);
    });

    test("returns true for two empty arrays", () => {
      expect(sameOrderedEvents([], [])).toBe(true);
    });

    test("returns true for single-element arrays with same id and ordinal", () => {
      expect(
        sameOrderedEvents([{ id: "1", ordinal: 5 }], [{ id: "1", ordinal: 5 }]),
      ).toBe(true);
    });

    test("returns false when arrays have different lengths", () => {
      const a = [{ id: "1", ordinal: 1 }, { id: "2", ordinal: 2 }];
      const b = [{ id: "1", ordinal: 1 }];
      expect(sameOrderedEvents(a, b)).toBe(false);
    });

    test("returns false when same id but different ordinal", () => {
      expect(
        sameOrderedEvents(
          [{ id: "1", ordinal: 10 }],
          [{ id: "1", ordinal: 20 }],
        ),
      ).toBe(false);
    });

    test("returns false when ordinal matches but id differs", () => {
      expect(
        sameOrderedEvents(
          [{ id: "1", ordinal: 10 }],
          [{ id: "2", ordinal: 10 }],
        ),
      ).toBe(false);
    });
  });
});

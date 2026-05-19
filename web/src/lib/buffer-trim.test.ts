import { describe, expect, test } from "bun:test";
import { sameOrderedEvents, sameOrderedIds } from "./buffer-trim";

describe("buffer-trim", () => {
  test("sameOrderedIds detects id changes", () => {
    const a = [{ id: "1" }, { id: "2" }];
    const b = [{ id: "1" }, { id: "2" }];
    const c = [{ id: "1" }, { id: "3" }];
    expect(sameOrderedIds(a, b)).toBe(true);
    expect(sameOrderedIds(a, c)).toBe(false);
  });

  test("sameOrderedEvents compares ordinal", () => {
    const a = [{ id: "1", ordinal: 10 }];
    const b = [{ id: "1", ordinal: 10 }];
    const c = [{ id: "1", ordinal: 11 }];
    expect(sameOrderedEvents(a, b)).toBe(true);
    expect(sameOrderedEvents(a, c)).toBe(false);
  });
});

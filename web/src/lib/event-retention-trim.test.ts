import { describe, expect, test } from "bun:test";
import { trimEventsByRetention } from "./event-retention-trim";
import type { UiEvent } from "./types";

function ev(id: string, ts: string, ordinal: number): UiEvent {
  return {
    id,
    ordinal,
    timestamp: ts,
    domain: "climate",
    severity_score: 0.5,
    location: null,
  };
}

describe("trimEventsByRetention", () => {
  const now = Date.parse("2026-05-20T12:00:00Z");

  test("drops events older than the retention window", () => {
    const recent = ev("a", "2026-05-20T11:00:00Z", 3);
    const old = ev("b", "2026-05-18T11:00:00Z", 2);
    const got = trimEventsByRetention([recent, old], { nowMs: now });
    expect(got.map((e) => e.id)).toEqual(["a"]);
  });

  test("keeps newest by ordinal when above soft cap", () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      ev(`e${i}`, "2026-05-20T11:00:00Z", i),
    );
    const got = trimEventsByRetention(rows, {
      nowMs: now,
      softMax: 3,
      hardMax: 10,
    });
    expect(got.map((e) => e.id)).toEqual(["e4", "e3", "e2"]);
  });

  test("never exceeds hard ceiling", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      ev(`e${i}`, "2026-05-20T11:00:00Z", i),
    );
    const got = trimEventsByRetention(rows, {
      nowMs: now,
      softMax: 800,
      hardMax: 5,
    });
    expect(got).toHaveLength(5);
    expect(got[0]!.id).toBe("e11");
  });

  test("applies hard ceiling before soft cap on burst", () => {
    const rows = Array.from({ length: 2500 }, (_, i) =>
      ev(`e${i}`, "2026-05-20T11:00:00Z", i),
    );
    const got = trimEventsByRetention(rows, {
      nowMs: now,
      softMax: 800,
      hardMax: 2000,
    });
    expect(got).toHaveLength(2000);
    expect(got[0]!.id).toBe("e2499");
  });
});

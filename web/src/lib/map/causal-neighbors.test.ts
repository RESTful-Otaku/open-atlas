import { describe, expect, test } from "bun:test";

import type { UiCausalEdge } from "../types";
import {
  causalNeighborsForEvent,
  eventDetailPath,
} from "./causal-neighbors";

const edges: UiCausalEdge[] = [
  {
    id: "1",
    source_event_id: "10",
    target_event_id: "99",
    influence_score: 0.9,
    decay_rate: 0.1,
  },
  {
    id: "2",
    source_event_id: "11",
    target_event_id: "99",
    influence_score: 0.3,
    decay_rate: 0.1,
  },
  {
    id: "3",
    source_event_id: "99",
    target_event_id: "20",
    influence_score: 0.7,
    decay_rate: 0.1,
  },
];

describe("causalNeighborsForEvent", () => {
  test("lists incoming/outgoing sorted by influence", () => {
    const r = causalNeighborsForEvent("99", edges);
    expect(r.counts).toEqual({ incoming: 2, outgoing: 1 });
    expect(r.incoming.map((n) => n.eventId)).toEqual(["10", "11"]);
    expect(r.outgoing[0]?.eventId).toBe("20");
  });

  test("respects per-direction limit", () => {
    const many: UiCausalEdge[] = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      source_event_id: String(100 + i),
      target_event_id: "42",
      influence_score: i / 12,
      decay_rate: 0.1,
    }));
    const r = causalNeighborsForEvent("42", many, 3);
    expect(r.incoming).toHaveLength(3);
    expect(r.counts.incoming).toBe(12);
  });
});

describe("eventDetailPath", () => {
  test("encodes event id for hash router", () => {
    expect(eventDetailPath("42")).toBe("/events/42");
    expect(eventDetailPath("a/b")).toBe("/events/a%2Fb");
  });
});

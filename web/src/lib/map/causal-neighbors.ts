import type { UiCausalEdge } from "../types";
import { countCausalForEvent } from "./event-map-hover";

export type CausalNeighborLink = {
  readonly eventId: string;
  readonly direction: "incoming" | "outgoing";
  readonly influenceScore: number;
};

export type CausalNeighborsResult = {
  readonly incoming: readonly CausalNeighborLink[];
  readonly outgoing: readonly CausalNeighborLink[];
  readonly counts: { readonly incoming: number; readonly outgoing: number };
};

/**
 * Related events from the causal edge ring, sorted by influence (desc).
 * Caps list length; totals reflect the full ring scan.
 */
export function causalNeighborsForEvent(
  eventId: string,
  edges: readonly UiCausalEdge[],
  limitPerDirection = 8,
): CausalNeighborsResult {
  const incoming: CausalNeighborLink[] = [];
  const outgoing: CausalNeighborLink[] = [];

  for (const e of edges) {
    if (e.target_event_id === eventId) {
      incoming.push({
        eventId: e.source_event_id,
        direction: "incoming",
        influenceScore: e.influence_score,
      });
    } else if (e.source_event_id === eventId) {
      outgoing.push({
        eventId: e.target_event_id,
        direction: "outgoing",
        influenceScore: e.influence_score,
      });
    }
  }

  const byInfluence = (a: CausalNeighborLink, b: CausalNeighborLink) =>
    b.influenceScore - a.influenceScore;

  incoming.sort(byInfluence);
  outgoing.sort(byInfluence);

  const counts = countCausalForEvent(eventId, edges);

  return {
    incoming: incoming.slice(0, limitPerDirection),
    outgoing: outgoing.slice(0, limitPerDirection),
    counts,
  };
}

/** Hash-router path for an event detail page. */
export function eventDetailPath(eventId: string): string {
  return `/events/${encodeURIComponent(eventId)}`;
}

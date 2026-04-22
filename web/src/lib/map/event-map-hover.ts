import type { UiCausalEdge, UiSignal } from "../types";

export function signalsForEvent(
  eventId: string,
  signals: readonly UiSignal[],
  limit = 4,
): UiSignal[] {
  return signals
    .filter((s) => s.event_id === eventId)
    .slice(0, limit);
}

export function countCausalForEvent(
  eventId: string,
  edges: readonly UiCausalEdge[],
): { incoming: number; outgoing: number } {
  let incoming = 0;
  let outgoing = 0;
  for (const e of edges) {
    if (e.target_event_id === eventId) incoming += 1;
    if (e.source_event_id === eventId) outgoing += 1;
  }
  return { incoming, outgoing };
}

const CARD_W = 300;
const CARD_H_EST = 320;

/**
 * Keep the top-left of a fixed-size card inside a container
 * (x,y are pointer position in container local pixels).
 */
export function clampCardPosition(
  x: number,
  y: number,
  containerW: number,
  containerH: number,
  cardW = CARD_W,
  cardH = CARD_H_EST,
  pointerOffset = 14,
): { left: number; top: number } {
  const pad = 6;
  let left = x + pointerOffset;
  let top = y + pointerOffset;
  if (left + cardW + pad > containerW) {
    left = x - cardW - pointerOffset;
  }
  if (top + cardH + pad > containerH) {
    top = y - cardH - pointerOffset;
  }
  if (left < pad) left = pad;
  if (top < pad) top = pad;
  if (left + cardW > containerW - pad) {
    left = Math.max(pad, containerW - cardW - pad);
  }
  if (top + cardH > containerH - pad) {
    top = Math.max(pad, containerH - cardH - pad);
  }
  return { left, top };
}

export const HOVER_CARD_SIZE = { w: CARD_W, h: CARD_H_EST };

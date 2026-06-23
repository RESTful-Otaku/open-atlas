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
const CARD_H_EST = 360;
const CARD_H_EST_COMPACT = 420;

export type MapHoverInsets = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

export function clampCardPosition(
  x: number,
  y: number,
  containerW: number,
  containerH: number,
  cardW = CARD_W,
  cardH = CARD_H_EST,
  pointerOffset = 14,
  insets: MapHoverInsets = {},
): { left: number; top: number } {
  const pad = 6;
  const topPad = pad + (insets.top ?? 0);
  const rightPad = pad + (insets.right ?? 0);
  const bottomPad = pad + (insets.bottom ?? 0);
  const leftPad = pad + (insets.left ?? 0);

  let left = x + pointerOffset;
  let top = y + pointerOffset;
  if (left + cardW + rightPad > containerW) {
    left = x - cardW - pointerOffset;
  }
  if (top + cardH + bottomPad > containerH) {
    top = y - cardH - pointerOffset;
  }
  if (left < leftPad) left = leftPad;
  if (top < topPad) top = topPad;
  if (left + cardW > containerW - rightPad) {
    left = Math.max(leftPad, containerW - cardW - rightPad);
  }
  if (top + cardH > containerH - bottomPad) {
    top = Math.max(topPad, containerH - cardH - bottomPad);
  }
  return { left, top };
}

const MOBILE_NAV_FALLBACK_PX = 68;

export function mobileNavInsetPx(): number {
  if (typeof document === "undefined") return MOBILE_NAV_FALLBACK_PX;
  const nav = document.querySelector(".mobile-bottom-nav");
  if (nav instanceof HTMLElement) {
    const h = nav.getBoundingClientRect().height;
    if (h > 0) return h;
  }
  const shell = document.querySelector(".shell.shell--compact");
  if (shell instanceof HTMLElement) {
    const pb = getComputedStyle(shell).paddingBottom;
    const match = pb.match(/([\d.]+)px/);
    if (match) return Number.parseFloat(match[1]);
  }
  return MOBILE_NAV_FALLBACK_PX;
}

export const MAP_MOBILE_RAIL_INSET_PX = 80;

export function compactMapCardInsets(): MapHoverInsets {
  const nav = mobileNavInsetPx();
  return {
    top: 8,
    right: MAP_MOBILE_RAIL_INSET_PX,
    bottom: nav + 16,
    left: 8,
  };
}

export const HOVER_CARD_SIZE = { w: CARD_W, h: CARD_H_EST };
export const HOVER_CARD_SIZE_COMPACT = { w: CARD_W, h: CARD_H_EST_COMPACT };
